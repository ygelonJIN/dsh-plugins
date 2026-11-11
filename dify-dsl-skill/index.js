/**
 * @local/dify-dsl-skill — Dify 工作流 DSL 技能提供方
 *
 * 只做一件事：把包内 assets/ 作为一个技能挂进 DSH 的技能目录。
 * 目录条目叫 dify-workflow-dsl，正文是 assets/SKILL.md，资源基底是 assets/，
 * 所以 SKILL.md 里写的 references/…、examples/…、scripts/… 都能按相对路径读到。
 *
 * rank 600 = 宿主内置技能的档位，直接写字面量而不是 import
 * @deepseek-ai/dsh-skill，避免本地 link 包解析不到宿主内部包时整个插件起不来。
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const name = "dify-dsl-skill";

/** 需要 skills 服务；它由宿主提供，技能目录才有地方注册。 */
export const inject = ["skills"];

const PROVIDER_NAME = "dify-dsl";
const SKILL_NAME = "dify-workflow-dsl";
const BUNDLED_RANK = 600;

const ASSETS_DIR = fileURLToPath(new URL("./assets/", import.meta.url));
const SKILL_FILE = fileURLToPath(new URL("./assets/SKILL.md", import.meta.url));

const RESOURCE_BASE = { kind: "directory", path: ASSETS_DIR };

const DESCRIPTION =
  "Create, modify, review, migrate, and debug import-ready Dify App DSL YAML for DSL 0.6.0 and 0.7.0. " +
  "Use for workflow/chatflow nodes, graph wiring, variables, branches, iteration and loop containers, " +
  "plugin dependencies, and import/export compatibility.";

const CANDIDATE = {
  name: SKILL_NAME,
  description: DESCRIPTION,
  invocation: { modelInvocable: true, userInvocable: true },
  provider: PROVIDER_NAME,
  source: "plugin",
  resourceBase: RESOURCE_BASE,
  rank: BUNDLED_RANK,
  path: SKILL_FILE,
  locator: SKILL_FILE,
};

const provider = {
  name: PROVIDER_NAME,
  list() {
    return Promise.resolve([CANDIDATE]);
  },
  async get() {
    return { ...CANDIDATE, content: await readFile(SKILL_FILE, "utf8") };
  },
};

export function apply(ctx) {
  ctx.skills.registerProvider(() => provider);
}

export default { name, inject, apply };
