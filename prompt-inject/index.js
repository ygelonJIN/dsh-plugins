/**
 * @local/prompt-inject — 系统提示文本附加器（带开关）
 *
 * 它只做一件事：向系统提示词里塞一段你自己写的正文，并且能一键关掉。
 *
 * 生效方式（全部在运行时，不碰磁盘上的应用包）：
 *   systemPrompt.section({ name, order, interpolate: false, text: () => ... })
 *   —— text 是函数，每次组装提示词都会被重新调用。
 *   所以改文件、切开关，下一轮对话立刻生效，不需要重启、不需要「应用补丁」。
 *
 * 两个文件，都在 DSH_HOME 里：
 *   <DSH_HOME>/prompt-inject.md          正文（可以直接用编辑器改）
 *   <DSH_HOME>/prompt-inject-onoff.json  开关 { "enabled": true }
 *
 * 注意：同一个 section 位置若还有别的插件也在写入，会出现两段正文。
 * 本插件不做冲突检测，同一位置只应有一个写入者。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const name = "@local/prompt-inject";

/** 只要 systemPrompt；webServer 走延迟注入（ctx.inject），避免它晚到时整个插件 pending。 */
export const inject = ["systemPrompt"];

const SECTION_NAME = "prompt-inject";
/** 尽量靠前：官方最靠前的 SECTION_ORDERS 是 HARNESS_IDENTITY = -1000。 */
const DEFAULT_ORDER = -99990;
const MAX_BODY_BYTES = 4 * 1024 * 1024;

// ---------------------------------------------------------------- 文件与状态

/**
 * 正文与开关可以放在 DSH_HOME 之外（例如外接硬盘）。
 * config.dir 给了就用它：正文 = <dir>/prompt.md，开关 = <dir>/state.json。
 * 没给则回落到 DSH_HOME 下的两个文件（兼容老路径）。
 */
let configuredDir = "";

function normalizeDir(raw) {
  const value = String(raw == null ? "" : raw).trim();
  if (!value) return "";
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return path.resolve(value);
}

function dshHome() {
  const fromEnv = String(process.env.DSH_HOME || "").trim();
  return fromEnv || path.join(os.homedir(), ".dsh");
}

function textFile() {
  if (configuredDir) return path.join(configuredDir, "prompt.md");
  return path.join(dshHome(), "prompt-inject.md");
}

function stateFile() {
  if (configuredDir) return path.join(configuredDir, "state.json");
  return path.join(dshHome(), "prompt-inject-onoff.json");
}

/** 外接盘没挂载时目录不存在；这不是错误，只是"读不到正文"。 */
function storageAvailable() {
  try {
    return fs.statSync(path.dirname(textFile())).isDirectory();
  } catch {
    return false;
  }
}

function readStateRaw() {
  try {
    const raw = fs.readFileSync(stateFile(), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** 默认开：只有明确写成 false 才算关。 */
export function isEnabled() {
  return readStateRaw().enabled !== false;
}

export function setEnabled(flag) {
  const next = { ...readStateRaw(), enabled: Boolean(flag), at: new Date().toISOString() };
  fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
  fs.writeFileSync(stateFile(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next.enabled;
}

export function readText() {
  try {
    return fs.readFileSync(textFile(), "utf8");
  } catch {
    return "";
  }
}

export function writeText(text) {
  const body = String(text == null ? "" : text);
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
    throw new Error(`正文超过 ${MAX_BODY_BYTES} 字节上限`);
  }
  fs.mkdirSync(path.dirname(textFile()), { recursive: true });
  const tmp = `${textFile()}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, body, "utf8");
  fs.renameSync(tmp, textFile());
  return Buffer.byteLength(body, "utf8");
}

// ---------------------------------------------------------------- 正文整形

/**
 * 剥掉 ChatML / project 标签：正文里带 `<|im_start|>system:` 这类包裹时，
 * 直接塞进 section 会形成第二套未闭合信封，模型会当成内容而不是指令。
 */
export function stripChatmlWrapping(text) {
  return String(text || "")
    .replace(/<\|im_start\|>\s*system\s*:\s*/gi, "")
    .replace(/<\/?project_instructions>/gi, "")
    .replace(/<\|im_end\|>/g, "");
}

/**
 * 宿主每次组装提示词都会调这个函数。
 * 记下最近一次调用，是"插件真的在被使用"的唯一硬证据 ——
 * 只要 lastInjection 的时间在往前走，就说明附加在生效，跟界面标签无关。
 */
let lastInjection = null;

export function getLastInjection() {
  return lastInjection;
}

export function composeSectionText() {
  const enabled = isEnabled();
  const body = enabled ? stripChatmlWrapping(readText()).trim() : "";
  lastInjection = {
    at: new Date().toISOString(),
    chars: body.length,
    enabled,
  };
  return body;
}

// ---------------------------------------------------------------- section 注册

/**
 * 双宿主注册：ctx 可能是代理，systemPrompt 服务同时挂在 ctx 和 ctx.systemPrompt.ctx 上。
 * 两种宿主都要试：代理场景下 ctx.systemPrompt.ctx 才是真正的服务宿主。
 */
function addSection(ctx, section) {
  const hosts = [];
  const push = (host) => {
    if (host && !hosts.includes(host)) hosts.push(host);
  };
  try {
    push(ctx?.systemPrompt?.ctx);
  } catch {
    /* 代理未注入时点属性会抛 */
  }
  push(ctx);

  const disposers = [];
  let registered = false;
  let lastError = null;
  for (const host of hosts) {
    try {
      const dispose = host.systemPrompt.section(section);
      registered = true;
      if (typeof dispose === "function") disposers.push(dispose);
    } catch (error) {
      const message = String((error && error.message) || error);
      if (message.includes("already registered")) registered = true;
      else lastError = error;
    }
  }
  if (!registered && lastError) throw lastError;

  if (disposers.length && typeof ctx?.effect === "function") {
    ctx.effect(() => () => {
      for (const dispose of disposers) {
        try {
          dispose();
        } catch {
          /* ignore */
        }
      }
    });
  }
  return registered;
}

// ---------------------------------------------------------------- HTTP

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("请求体过大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** 同源校验：只比 Origin 与 Host，不做鉴权（和宿主其它插件路由一致）。 */
function sameOrigin(req) {
  const origin = req.headers.origin;
  const host = String(req.headers.host || "");
  if (!origin) return true;
  if (origin === "null") return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function log(message) {
  try {
    console.log(`[prompt-inject] ${message}`);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- 插件入口

export function apply(ctx, config = {}) {
  const order = Number.isFinite(config.order) ? config.order : DEFAULT_ORDER;
  configuredDir = normalizeDir(config.dir);
  if (configuredDir) log(`正文目录 = ${configuredDir}`);

  try {
    const ok = addSection(ctx, {
      name: SECTION_NAME,
      order,
      interpolate: false,
      text: () => composeSectionText(),
    });
    log(ok ? `section "${SECTION_NAME}" 已注册（order ${order}）` : "section 注册返回 false");
  } catch (error) {
    log(`section 注册失败: ${String((error && error.message) || error)}`);
  }

  // 路由：设置页靠它读写正文与开关
  try {
    ctx.inject(["webServer"], (host) => {
      host.effect(() => {
        const disposers = [];
        const track = (dispose) => {
          if (typeof dispose === "function") disposers.push(dispose);
        };
        const route = (spec) =>
          track(
            host.webServer.register({
              ...spec,
              handler: async (request, response) => {
                if (!sameOrigin(request)) {
                  sendJson(response, 403, { ok: false, error: "cross-origin blocked" });
                  return;
                }
                try {
                  await spec.handler(request, response);
                } catch (error) {
                  sendJson(response, 500, {
                    ok: false,
                    error: String((error && error.message) || error),
                  });
                }
              },
            }),
          );

        route({
          kind: "exact",
          path: "/prompt-inject/status",
          handler: (request, response) => {
            if (request.method !== "GET") {
              sendJson(response, 405, { ok: false, error: "GET only" });
              return;
            }
            const text = readText();
            const composed = stripChatmlWrapping(text).trim();
            let mtime = null;
            try {
              mtime = fs.statSync(textFile()).mtime.toISOString();
            } catch {
              mtime = null;
            }
            sendJson(response, 200, {
              ok: true,
              enabled: isEnabled(),
              chars: text.length,
              inject_chars: composed.length,
              last_inject: getLastInjection(),
              mtime,
              path: textFile(),
              dir: configuredDir || path.dirname(textFile()),
              available: storageAvailable(),
              state_path: stateFile(),
              section: SECTION_NAME,
              order,
            });
          },
        });

        route({
          kind: "exact",
          path: "/prompt-inject/text",
          handler: async (request, response) => {
            if (request.method === "GET") {
              sendJson(response, 200, { ok: true, text: readText() });
              return;
            }
            if (request.method === "POST") {
              const raw = await readBody(request);
              const payload = raw.trim() ? JSON.parse(raw) : {};
              const bytes = writeText(payload.text);
              sendJson(response, 200, { ok: true, bytes, enabled: isEnabled() });
              return;
            }
            sendJson(response, 405, { ok: false, error: "GET or POST" });
          },
        });

        route({
          kind: "exact",
          path: "/prompt-inject/enabled",
          handler: async (request, response) => {
            if (request.method === "GET") {
              sendJson(response, 200, { ok: true, enabled: isEnabled() });
              return;
            }
            if (request.method === "POST") {
              const raw = await readBody(request);
              const payload = raw.trim() ? JSON.parse(raw) : {};
              const enabled = setEnabled(payload.enabled);
              sendJson(response, 200, { ok: true, enabled });
              return;
            }
            sendJson(response, 405, { ok: false, error: "GET or POST" });
          },
        });

        return () => {
          for (let i = disposers.length - 1; i >= 0; i -= 1) {
            try {
              disposers[i]();
            } catch {
              /* ignore */
            }
          }
          disposers.length = 0;
        };
      });
    });
  } catch (error) {
    log(`路由注册失败: ${String((error && error.message) || error)}`);
  }
}

export default { name, inject, apply };
