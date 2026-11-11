/** 契约自测：不启动宿主，用假 ctx 验证提供方字段与正文可读。 */
import assert from "node:assert/strict";
import { apply, name, inject } from "../index.js";

assert.equal(name, "dify-dsl-skill");
assert.deepEqual(inject, ["skills"]);

let registered = null;
apply({
  skills: {
    registerProvider(create) {
      assert.equal(typeof create, "function");
      registered = create({ invalidate() {} });
    },
  },
});

assert.ok(registered, "provider not registered");
assert.equal(registered.name, "dify-dsl");

const list = await registered.list();
assert.equal(list.length, 1);
const candidate = list[0];
assert.equal(candidate.name, "dify-workflow-dsl");
assert.match(candidate.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
assert.equal(candidate.provider, "dify-dsl");
assert.equal(candidate.invocation.modelInvocable, true);
assert.equal(candidate.invocation.userInvocable, true);
assert.equal(typeof candidate.description, "string");
assert.ok(candidate.description.length > 0);
assert.ok(candidate.resourceBase && candidate.resourceBase.kind === "directory");

const skill = await registered.get(candidate);
assert.equal(skill.name, "dify-workflow-dsl");
assert.ok(skill.content.startsWith("---\nname: dify-workflow-dsl"));
assert.ok(skill.content.includes("validate_dsl.py"));

console.log("dify-dsl-skill smoke ok:", candidate.name, skill.content.length, "chars");
