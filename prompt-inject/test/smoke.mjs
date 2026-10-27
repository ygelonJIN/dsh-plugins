#!/usr/bin/env node
/**
 * 自测：不需要真实正文，不需要跑 DSH。
 *
 *   node test/smoke.mjs
 *
 * 用临时目录造 fixture，构造假 ctx，验证四件事：
 *   1. section 注册参数正确（name / order / interpolate / text 是函数）
 *   2. 开关：开 → 有正文；关 → 空串
 *   3. ChatML 包裹会被剥掉
 *   4. last_inject 每次调用都更新
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PLUGIN = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const mod = await import(path.join(PLUGIN, "index.js"));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prompt-inject-test-"));
const textPath = path.join(dir, "prompt.md");
const statePath = path.join(dir, "state.json");

/** 假 ctx：只提供插件实际用到的两个接缝。 */
function makeCtx() {
  const seen = { sections: [], injected: [] };
  const ctx = {
    systemPrompt: {
      ctx: null,
      section(spec) {
        seen.sections.push(spec);
        return () => {};
      },
    },
    effect(fn) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    },
    inject(services, cb) {
      seen.injected.push(services);
      // 不调用 cb：webServer 在测试里不存在，路由部分不参与断言
    },
  };
  return { ctx, seen };
}

let passed = 0;
function check(label, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
}

console.log("prompt-inject smoke test");
console.log(`  fixture: ${dir}`);

// --- 1. 空正文时注册仍然成立，但注入为空
{
  const { ctx, seen } = makeCtx();
  mod.apply(ctx, { dir });
  check("section 注册了一个", () => assert.equal(seen.sections.length, 1));
  const spec = seen.sections[0];
  check("name = prompt-inject", () => assert.equal(spec.name, "prompt-inject"));
  check("order 是有限数（默认 -99990）", () => {
    assert.ok(Number.isFinite(spec.order));
    assert.equal(spec.order, -99990);
  });
  check("interpolate = false（正文原样输出）", () => assert.equal(spec.interpolate, false));
  check("text 是函数（每轮调用）", () => assert.equal(typeof spec.text, "function"));
  check("空正文 → 空串", () => assert.equal(spec.text({}), ""));
  check("webServer 走延迟注入", () => assert.deepEqual(seen.injected[0], ["webServer"]));
}

// --- 2. 写入正文 + ChatML 包裹剥离
{
  fs.writeFileSync(
    textPath,
    "<|im_start|>system:<project_instructions>\r\n\r\nHELLO-BODY<|im_end|>\r\n",
    "utf8",
  );
  const { ctx, seen } = makeCtx();
  mod.apply(ctx, { dir });
  const spec = seen.sections[0];
  check("正文被取到且剥掉 ChatML", () => assert.equal(spec.text({}), "HELLO-BODY"));
  check("开关默认开", () => assert.equal(mod.isEnabled(), true));
}

// --- 3. 关闭后一个字都不发，正文仍在
{
  mod.setEnabled(false);
  const { ctx, seen } = makeCtx();
  mod.apply(ctx, { dir });
  const spec = seen.sections[0];
  check("关闭 → 空串", () => assert.equal(spec.text({}), ""));
  check("正文没被删", () => assert.ok(fs.readFileSync(textPath, "utf8").includes("HELLO-BODY")));
  check("state.json 写成 enabled:false", () => {
    const raw = JSON.parse(fs.readFileSync(statePath, "utf8"));
    assert.equal(raw.enabled, false);
  });
}

// --- 4. 重新打开 + last_inject 会前进
{
  mod.setEnabled(true);
  const { ctx, seen } = makeCtx();
  mod.apply(ctx, { dir });
  const spec = seen.sections[0];

  // 上一段是"关闭"状态，last_inject 记的是 chars:0；这里应变成真实长度
  const before = mod.getLastInjection();
  const first = spec.text({});
  const a = mod.getLastInjection();

  check("重新打开 → 正文回来", () => assert.equal(first, "HELLO-BODY"));
  check("last_inject 记录字数与开关", () => {
    assert.equal(a.chars, first.length);
    assert.equal(a.enabled, true);
    assert.ok(Number.isFinite(Date.parse(a.at)));
  });
  check("last_inject 相对上一段有变化", () => {
    assert.notEqual(a.chars, before ? before.chars : -1);
  });

  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = spec.text({});
  const b = mod.getLastInjection();
  check("第二次调用时间戳前进", () => assert.ok(Date.parse(b.at) > Date.parse(a.at)));
  check("两次内容一致", () => assert.equal(second, first));
}

// --- 5. 目录不存在时不抛（外接盘没挂载的场景）
{
  const { ctx, seen } = makeCtx();
  mod.apply(ctx, { dir: path.join(dir, "does-not-exist") });
  const spec = seen.sections[0];
  check("目录不存在 → 返回空串而不是抛错", () => assert.equal(spec.text({}), ""));
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${passed} 项全部通过`);
