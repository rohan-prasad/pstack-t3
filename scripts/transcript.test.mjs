// Tests for the scripts that read Claude Code transcripts: the shared reader, the compaction hook and its installer,
// and the adherence report. Run with `node --test scripts/`.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { continuesTask, isDrop, isInvocation, promptOf, readsOf, typedCommand, userText } from "./transcript.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK = join(HERE, "pstack-compaction-hook.mjs");
const ADHERENCE = join(HERE, "adherence.mjs");

const INVOKE = "<command-message>poteto-mode</command-message>\n<command-name>/poteto-mode</command-name>\n<command-args>do the thing</command-args>";
const COMPACTED = "This session is being continued from a previous conversation that ran out of context.";
const user = (text, extra = {}) => JSON.stringify({ type: "user", timestamp: "2026-11-20T10:00:00.000Z", message: { role: "user", content: text }, ...extra });
const call = (name, input) => JSON.stringify({ type: "assistant", message: { role: "assistant", model: "claude-test", content: [{ type: "tool_use", id: "t", name, input }] } });
const result = (text) => JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: text }] } });
const bash = (command) => call("Bash", { command });
const scratch = () => mkdtempSync(join(tmpdir(), "pstack-test-"));

// A skills folder shaped like the installed one, so the hook finds the files it names.
function skillsIn(root) {
  const skills = join(root, "skills");
  for (const path of ["poteto-mode/SKILL.md", "poteto-mode/playbooks/feature.md", "poteto-mode/playbooks/investigation.md", "pstack-t3/SKILL.md", "pstack-t3/child.md"]) {
    mkdirSync(dirname(join(skills, path)), { recursive: true });
    writeFileSync(join(skills, path), "x\n");
  }
  return skills;
}

function transcript(root, lines, name = "session.jsonl") {
  const path = join(root, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${lines.join("\n")}\n`);
  return path;
}

const hook = (path, source = "compact") => spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ transcript_path: path, source }), encoding: "utf8" });
// Claude Code's input for a PreToolUse hook, and the decision the hook printed, if any. The hook runs with no T3 Code
// variable in its environment unless `t3` sets one, so the transcript's `entrypoint` says whether T3 Code started it.
const T3 = { entrypoint: "t3-code" };
const beforeTool = (path, tool = "Agent", { input = { description: "x", prompt: "y" }, t3 = false } = {}) => {
  const env = { ...process.env };
  delete env.T3CODE_THREAD_ID;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  if (t3) env.T3CODE_THREAD_ID = "thread-test";
  return spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: tool, tool_input: input, transcript_path: path }), encoding: "utf8", env });
};
const beforePrompt = (path, prompt, { t3 = false } = {}) => {
  const env = { ...process.env };
  delete env.T3CODE_THREAD_ID;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  if (t3) env.T3CODE_THREAD_ID = "thread-test";
  return spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ hook_event_name: "UserPromptSubmit", transcript_path: path, prompt }), encoding: "utf8", env });
};
const decision = (run) => (run.stdout ? JSON.parse(run.stdout).hookSpecificOutput : undefined);

test("an invocation is the command envelope at the start of a prompt", () => {
  assert.ok(isInvocation(INVOKE));
  assert.ok(isInvocation("<command-name>/poteto-mode</command-name>\n<command-message>poteto-mode</command-message>"));
  assert.ok(isInvocation("<command-message>pstack:poteto-mode</command-message>\n<command-name>/pstack:poteto-mode</command-name>"));
  assert.ok(!isInvocation("why does the log show <command-name>/poteto-mode</command-name> here?"));
  assert.ok(!isInvocation("<command-name>/compact</command-name>"));
  assert.ok(!isInvocation("<command-message>poteto-help</command-message>\n<command-name>/poteto-help</command-name>"));
});

test("a wake or a built-in command continues a task, and an invocation never does", () => {
  assert.ok(continuesTask("Delegated task node:x (Review) [completed]:\nok"));
  assert.ok(continuesTask("<command-name>/compact</command-name>\n<command-message>compact</command-message>"));
  assert.ok(continuesTask(COMPACTED));
  assert.ok(continuesTask("Update on pull request #90 (https://github.com/o/r/pull/90), which T3 Code is watching for you:\n- Checks failed on ab6004f"));
  assert.ok(!continuesTask("Update on pull request #3, please. Is it green?"), "an operator's own words stay a new task");
  assert.ok(!continuesTask("<command-name>/poteto-mode</command-name>"));
  assert.ok(!continuesTask("now fix the test"));
  assert.ok(isDrop("ok, drop poteto-mode for the rest of this thread"));
  assert.ok(isDrop("Drop poteto mode"));
  assert.ok(!isDrop("keep going in poteto mode"));
});

test("typed commands name the skill without its plugin prefix", () => {
  for (const [prompt, name, invoked] of [
    ["/poteto-mode x", "poteto-mode", true],
    ["/pstack:poteto-mode", "poteto-mode", true],
    ["/poteto-modes", "poteto-modes", false],
    ["/compact", "compact", false],
    ["look at /poteto-mode", undefined, false],
  ]) assert.deepEqual([typedCommand(prompt), isInvocation(prompt)], [name, invoked], prompt);
});

test("only a prompt counts as a prompt", () => {
  assert.equal(promptOf(JSON.parse(user("hello"))), "hello");
  assert.equal(promptOf(JSON.parse(user([{ type: "text", text: "hello" }]))), "hello");
  assert.equal(promptOf(JSON.parse(user(INVOKE, { isMeta: true }))), undefined);
  assert.equal(userText(JSON.parse(user(INVOKE, { isMeta: true }))), INVOKE, "an injected record still shows its text");
  assert.equal(userText(JSON.parse(result(INVOKE))), undefined);
  assert.equal(promptOf(JSON.parse(user(INVOKE, { isSidechain: true }))), undefined);
  assert.equal(promptOf(JSON.parse(result(INVOKE))), undefined);
});

test("a read is a call that read the file, whole or in part", () => {
  const reads = (line) => readsOf(JSON.parse(line).message.content[0]);
  assert.deepEqual(reads(call("Read", { file_path: "/s/pstack-t3/SKILL.md" })), [{ path: "/s/pstack-t3/SKILL.md", whole: true }]);
  assert.deepEqual(reads(call("Read", { file_path: "/s/a.md", limit: 40 })), [{ path: "/s/a.md", whole: false }]);
  assert.deepEqual(reads(bash("cd /s; cat pstack-t3/SKILL.md poteto-mode/playbooks/feature.md")), [
    { path: "pstack-t3/SKILL.md", whole: true },
    { path: "poteto-mode/playbooks/feature.md", whole: true },
  ]);
  assert.deepEqual(reads(bash("cat /s/pstack-t3/SKILL.md | head -80")), [{ path: "/s/pstack-t3/SKILL.md", whole: false }]);
  assert.deepEqual(reads(bash("head -c 2500 /s/a.md")), [{ path: "/s/a.md", whole: false }]);
  assert.deepEqual(reads(bash("sed -n 1,60p /s/a.md")), [{ path: "/s/a.md", whole: false }]);
  assert.deepEqual(reads(bash("sed 1,6d /s/a.md")), [{ path: "/s/a.md", whole: true }]);
  assert.deepEqual(reads(bash("for p in fix-root-causes prove-it-works; do sed -n 1,60p principle-$p/SKILL.md; done")), [
    { path: "principle-fix-root-causes/SKILL.md", whole: false },
    { path: "principle-prove-it-works/SKILL.md", whole: false },
  ]);
  assert.deepEqual(reads(bash('for f in a/x.md b/y.md; do echo "== $f"; cat "$f"; done')), [
    { path: "a/x.md", whole: true },
    { path: "b/y.md", whole: true },
  ]);
  assert.deepEqual(reads(bash("cat principle-{one,two}/SKILL.md")), [
    { path: "principle-one/SKILL.md", whole: true },
    { path: "principle-two/SKILL.md", whole: true },
  ]);
  assert.deepEqual(reads(bash("cat /s/a.md > /tmp/copy.md")), [{ path: "/s/a.md", whole: true }]);
  for (const command of ["echo /s/pstack-t3/SKILL.md", "ls /s/poteto-mode/playbooks/", "grep -n todo /s/pstack-t3/SKILL.md", "wc -l /s/pstack-t3/SKILL.md", "cat <<'EOF' > /s/playbooks/x.md\nhi\nEOF"]) {
    assert.deepEqual(reads(bash(command)), [], command);
  }
  assert.deepEqual(reads(call("mcp__t3-code__delegate_task", { task: "Read /s/pstack-t3/child.md first, then /s/poteto-mode/playbooks/feature.md" })), []);
});

test("the hook reminds a thread where the mode is on, and names the playbook it read last", () => {
  const root = scratch();
  const skills = skillsIn(root);
  const path = transcript(root, [
    user(INVOKE),
    user(`implement it /poteto-mode\nBase directory for this skill: ${skills}/poteto-mode\n\n# Poteto mode`, { isMeta: true }),
    bash(`cat ${skills}/pstack-t3/SKILL.md ${skills}/poteto-mode/playbooks/feature.md`),
    call("mcp__t3-code__send_to_user", { message: `see ${skills}/poteto-mode/playbooks/investigation.md` }),
  ]);
  const out = hook(path).stdout;
  assert.match(out, /^pstack: poteto-mode is on in this thread/);
  assert.ok(out.includes(`- ${skills}/poteto-mode/SKILL.md\n`));
  assert.ok(out.includes(`- ${skills}/pstack-t3/SKILL.md\n`));
  assert.ok(out.includes("playbooks/feature.md, a playbook this thread read last"));
  assert.ok(!out.includes("investigation.md"), "a playbook that a message only names was not read");
  assert.equal(hook(path, "startup").stdout, "");
  assert.equal(spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ transcript_path: path }), encoding: "utf8" }).stdout, "", "no source, no reminder");

  // A run reads its own playbook, then Opening a PR. Both are named, the latest last.
  const body = user(`Base directory for this skill: ${skills}/poteto-mode\n\n# Poteto mode`, { isMeta: true });
  const both = hook(transcript(root, [user(INVOKE, { isMeta: true }), body, bash(`cat ${skills}/poteto-mode/playbooks/feature.md`), bash(`cat ${skills}/poteto-mode/playbooks/investigation.md`)])).stdout;
  assert.match(both, /^pstack: poteto-mode is on/, "the command counts in an injected record too");
  assert.ok(both.indexOf("playbooks/feature.md, a playbook this thread read\n") < both.indexOf("playbooks/investigation.md, a playbook this thread read last"));
});

test("the hook stays quiet where the mode is not on", () => {
  const root = scratch();
  const skills = skillsIn(root);
  const loaded = user(`Base directory for this skill: ${skills}/poteto-mode\n\n# Poteto mode`, { isMeta: true });
  const quiet = (lines) => assert.equal(hook(transcript(root, lines)).stdout, "");
  quiet([user("why does the log show <command-name>/poteto-mode</command-name> here?")]);
  quiet([user("look at this"), result(INVOKE)]);
  quiet([user(INVOKE), loaded, user("thanks, now drop poteto-mode for the rest of this thread")]);
  quiet([user("plain task"), bash("ls")]);
  assert.match(hook(transcript(root, [user(INVOKE), loaded, user("drop poteto-mode"), user(INVOKE)])).stdout, /poteto-mode is on/);
  assert.equal(hook(join(root, "missing.jsonl")).stdout, "");
  const garbage = spawnSync(process.execPath, [HOOK], { input: "not json", encoding: "utf8" });
  assert.equal(garbage.status, 0);
  assert.equal(garbage.stdout, "");
});

test("the hook knows a delegate by the child adapter path in its brief", () => {
  const root = scratch();
  const skills = skillsIn(join(root, "other install"));
  const brief = `Act as the review sub-agent for this task.\n\nRead ${skills}/pstack-t3/child.md first. The skill is ${skills}/poteto-mode/SKILL.md. Review the diff.`;
  const out = hook(transcript(root, [user(brief), bash(`cat ${skills}/pstack-t3/child.md`)])).stdout;
  assert.match(out, /^pstack: this thread is a pstack delegate/);
  assert.ok(out.includes(`- ${skills}/pstack-t3/child.md\n`), "a path with a space in it survives");
  assert.ok(out.includes(`- ${skills}/poteto-mode/SKILL.md\n`));
  const plain = hook(transcript(root, [user(`Act as the research sub-agent.\n\nRead ${skills}/pstack-t3/child.md first, then map the gate.`)])).stdout;
  assert.ok(plain.includes(`- ${skills}/pstack-t3/child.md\n`));
  assert.ok(!plain.includes("poteto-mode/SKILL.md"));
  assert.equal(hook(transcript(root, [user("a top-level task"), user(`by the way, what is ${skills}/pstack-t3/child.md for?`)])).stdout, "");
});

test("the hook refuses Claude Code's own subagent tool where the mode is on, and in a delegate", () => {
  const root = scratch();
  const skills = skillsIn(root);
  const loaded = user(`Base directory for this skill: ${skills}/poteto-mode\n\n# Poteto mode`, { isMeta: true, ...T3 });
  const on = transcript(root, [user(INVOKE, T3), loaded, bash(`cat ${skills}/pstack-t3/SKILL.md`)], "on.jsonl");
  for (const tool of ["Agent", "Task"]) {
    const refused = decision(beforeTool(on, tool));
    assert.equal(refused.hookEventName, "PreToolUse");
    assert.equal(refused.permissionDecision, "deny", tool);
    assert.match(refused.permissionDecisionReason, /`delegate_task`/);
    assert.ok(refused.permissionDecisionReason.includes(`${skills}/pstack-t3/spawning.md`));
    assert.ok(refused.permissionDecisionReason.includes("~/.agents/pstack-models.md"));
    assert.match(refused.permissionDecisionReason, /`drop poteto-mode`/, "the refusal names the way out");
  }
  assert.equal(beforeTool(on, "Bash").stdout, "", "another tool is left alone");
  assert.equal(beforeTool(on, "TaskStop").stdout, "", "a tool whose name only starts with Task is left alone");
  assert.equal(beforeTool(on, "Agent", { input: { subagent_type: "web-fetch", prompt: "read a page" } }).stdout, "", "a stand-in for a missing tool is a tool call");
  assert.equal(hook(on).stdout.startsWith("pstack: poteto-mode is on"), true, "the compaction reminder still works");

  const brief = `Act as the review sub-agent for this task.\n\nRead ${skills}/pstack-t3/child.md first. Review the diff.`;
  const child = decision(beforeTool(transcript(root, [user(brief, T3)], "child.jsonl")));
  assert.equal(child.permissionDecision, "deny");
  assert.match(child.permissionDecisionReason, /^pstack: this thread is a pstack delegate/);
  assert.ok(child.permissionDecisionReason.includes(`${skills}/pstack-t3/spawning.md`));
});

test("the refusal holds only in T3 Code, and only for poteto-mode's own spawns", () => {
  const root = scratch();
  const skills = skillsIn(root);
  const loaded = (extra = T3) => user(`Base directory for this skill: ${skills}/poteto-mode\n\n# Poteto mode`, { isMeta: true, ...extra });
  const quiet = (lines, name, options) => assert.equal(beforeTool(transcript(root, lines, name), "Agent", options).stdout, "", name);
  const refused = (lines, name, options) => assert.equal(decision(beforeTool(transcript(root, lines, name), "Agent", options))?.permissionDecision, "deny", name);

  // Outside T3 Code, Claude Code's own tool is how pstack spawns.
  quiet([user(INVOKE), loaded({})], "plain-claude-code.jsonl");
  quiet([user("<command-message>pstack:poteto-mode</command-message>\n<command-name>/pstack:poteto-mode</command-name>"), loaded({})], "upstream-plugin.jsonl");
  refused([user(INVOKE), loaded({})], "t3-by-environment.jsonl", { t3: true });

  // A skill from outside pstack runs as its own task, so its spawns are its own. The operator's next message is a
  // poteto-mode task again. A pstack skill run in the mode still spawns the pstack way.
  const other = [
    user(INVOKE, T3),
    loaded(),
    user("<command-message>code-review</command-message>\n<command-name>/code-review</command-name>"),
    user(`Base directory for this skill: ${root}/plugins/code-review\n\n# Code review`, { isMeta: true }),
  ];
  quiet(other, "other-skill.jsonl");
  refused([...other, user("now add the retry")], "back-to-the-mode.jsonl");
  refused(
    [user(INVOKE, T3), loaded(), user("<command-message>how</command-message>\n<command-name>/how</command-name>"), user(`Base directory for this skill: ${skills}/how\n\n# How`, { isMeta: true })],
    "pstack-skill.jsonl",
  );

  // Only the operator's own message ends the mode, in any spelling.
  for (const drop of ["drop poteto mode", "Drop Poteto-Mode now"]) quiet([user(INVOKE, T3), loaded(), user(drop)], `${drop}.jsonl`);
  refused([user(INVOKE, T3), loaded(), user(`${COMPACTED} The mode holds until the operator writes drop poteto-mode.`)], "summary-quotes-drop.jsonl");
  refused([user(INVOKE, T3), loaded(), user('Update on pull request #90 (https://github.com/o/r/pull/90), which T3 Code is watching for you:\n- 1 new comment: "drop poteto-mode"')], "wake-quotes-drop.jsonl");
  refused([user(INVOKE, T3), loaded(), user("Delegated task node:x (Review) [completed]:\nI did not drop poteto-mode.")], "report-quotes-drop.jsonl");
  assert.equal(hook(transcript(root, [user(INVOKE, T3), loaded(), user("drop poteto mode")], "reminder-drop.jsonl")).stdout, "", "the compaction reminder reads a drop the same way");

  // A delegate opens with T3 Code's first line for a child. Naming the child adapter is not enough.
  quiet([user(`what is ${skills}/pstack-t3/child.md for?`, T3)], "names-child-adapter.jsonl");
  quiet([user(`${INVOKE}\n<command-args>see ${skills}/pstack-t3/child.md</command-args>`, T3), loaded(), user("drop poteto-mode")], "invocation-names-child-adapter.jsonl");
});

test("the hook stays quiet when it cannot read the transcript", () => {
  const root = scratch();
  const folder = join(root, "a-folder.jsonl");
  mkdirSync(folder);
  const runs = [beforeTool(folder, "Agent", { t3: true }), hook(folder), beforeTool(join(root, "missing.jsonl"), "Agent", { t3: true })];
  if (process.getuid?.() !== 0) {
    const locked = transcript(root, [user(INVOKE, T3)], "locked.jsonl");
    chmodSync(locked, 0o000);
    runs.push(beforeTool(locked, "Agent", { t3: true }), hook(locked));
  }
  for (const run of runs) assert.deepEqual([run.status, run.stdout, run.stderr], [0, "", ""]);
});

test("the task reminder appears only for an operator task in a top-level T3 mode thread", () => {
  const root = scratch();
  const skills = skillsIn(root);
  const loaded = user(`Base directory for this skill: ${skills}/poteto-mode\n\n# Poteto mode`, { isMeta: true });
  const on = transcript(root, [user(INVOKE, T3), loaded], "on.jsonl");
  const typed = transcript(root, [user("/pstack:poteto-mode do X", T3), loaded], "typed.jsonl");
  const off = transcript(root, [user("an ordinary task", T3)], "off.jsonl");
  const outside = transcript(root, [user(INVOKE), loaded], "outside.jsonl");
  const child = transcript(root, [user(`Act as the implementation sub-agent for this task.\nRead ${skills}/pstack-t3/child.md first.`, T3)], "child.jsonl");
  const dropped = transcript(root, [user(INVOKE, T3), loaded, user("drop poteto-mode")], "dropped.jsonl");
  const other = join(root, "other", "code-review", "SKILL.md");
  mkdirSync(dirname(other), { recursive: true });
  writeFileSync(other, "x\n");
  const otherTask = transcript(root, [user(INVOKE, T3), loaded, user(`Base directory for this skill: ${dirname(other)}\n\n# Code review`, { isMeta: true })], "other-task.jsonl");
  const expected = "pstack: poteto-mode is on. Before your first edit or spawn on a new task, send the opening with `send_to_user`, with the playbook's steps as a checklist. A step marked Mandatory never ends as a skip, so Feature's step 4 delegates the code even when it looks small. A skill a step names counts only once you read its file.\n";
  const cases = [
    [off, "/poteto-mode do X", expected, "the typed invocation starts the mode"],
    [off, "/pstack:poteto-mode", expected, "a plugin invocation starts the mode"],
    [off, INVOKE, expected, "the command envelope starts the mode"],
    [on, "now add the retry", expected, "a plain message starts a task"],
    [typed, "now add the retry", expected, "a typed invocation in history keeps the mode on"],
    [on, "/poteto-mode", expected, "a repeated invocation starts a task"],
    [on, "/poteto-help explain", "", "a missing pstack skill stays quiet"],
    [on, "/pstack-t3", expected, "an installed pstack skill starts a task"],
    [on, "/pstack:pstack-t3 explain", expected, "a plugin prefix does not change skill ownership"],
    [on, "drop poteto-mode", "", "a drop ends the mode"],
    [on, "Delegated task node:x (Review) [completed]:\nok", "", "a child completion continues a task"],
    [on, "<task-notification>done</task-notification>", "", "a background task continues a task"],
    [on, COMPACTED, "", "a compaction summary continues a task"],
    [on, "Update on pull request #90 (https://github.com/o/r/pull/90), which T3 Code is watching for you:\n- Checks passed", "", "a PR wake continues a task"],
    [on, "<local-command-stdout>done</local-command-stdout>", "", "a local command continues a task"],
    [on, "[Request interrupted by user]", "", "an interrupt continues a task"],
    [on, "/compact", "", "a built-in compact command stays quiet"],
    [on, "/clear", "", "a built-in clear command stays quiet"],
    [on, "<command-name>/compact</command-name>", "", "a built-in envelope stays quiet"],
    [on, "/code-review", "", "a skill outside pstack stays quiet"],
    [on, "/other:code-review", "", "a plugin skill outside pstack stays quiet"],
    [child, "implement it", "", "a delegate stays quiet"],
    [child, "/poteto-mode implement it", "", "an invocation in a delegate stays quiet"],
    [outside, "implement it", "", "the mode outside T3 stays quiet"],
    [outside, "/poteto-mode implement it", "", "an invocation outside T3 stays quiet"],
    [off, "implement it", "", "the mode off stays quiet"],
    [off, "/pstack-t3", "", "a pstack command with the mode off stays quiet"],
    [dropped, "implement it", "", "a prior drop keeps the mode off"],
    [otherTask, "now add the retry", expected, "the next operator task returns to the mode"],
  ];
  for (const [path, prompt, output, name] of cases) assert.equal(beforePrompt(path, prompt).stdout, output, name);
  assert.equal(beforePrompt(outside, "implement it", { t3: true }).stdout, expected, "the T3 environment also identifies the session");
  assert.equal(beforePrompt(join(root, "missing.jsonl"), "/poteto-mode do X", { t3: true }).stdout, expected, "the first prompt arrives before the transcript exists");
  assert.equal(beforePrompt(join(root, "missing.jsonl"), "implement it", { t3: true }).stdout, "", "empty history does not enable the mode");
  assert.ok(beforePrompt(on, "implement it").stdout.trim().split(/\s+/).length < 60, "the reminder stays under 60 words");
  const folder = join(root, "folder.jsonl");
  mkdirSync(folder);
  const unreadable = beforePrompt(folder, "/poteto-mode", { t3: true });
  assert.deepEqual([unreadable.status, unreadable.stdout, unreadable.stderr], [0, "", ""], "a directory is unreadable history, not empty history");
  if (process.getuid?.() !== 0) {
    const locked = transcript(root, [user(INVOKE, T3)], "locked.jsonl");
    chmodSync(locked, 0o000);
    const run = beforePrompt(locked, "/poteto-mode", { t3: true });
    assert.deepEqual([run.status, run.stdout, run.stderr], [0, "", ""], "a permission error stays quiet");
  }
});

test("the installer changes only its own hooks", () => {
  const root = scratch();
  const settings = join(root, "settings.json");
  const install = (action, path = settings) => spawnSync(process.execPath, [HOOK, `--${action}`, path], { encoding: "utf8" });
  const original = { model: "opus", hooks: { SessionStart: [{ matcher: "startup", hooks: [{ type: "command", command: "node /x/pstack-compaction-hook.mjs.backup" }] }], Stop: [{ hooks: [{ type: "command", command: "echo stop" }] }] } };
  writeFileSync(settings, JSON.stringify(original));
  chmodSync(settings, 0o600);

  assert.equal(install("install").status, 0);
  assert.equal(statSync(settings).mode & 0o777, 0o600, "the file keeps its mode");
  const after = JSON.parse(readFileSync(settings, "utf8"));
  assert.equal(after.hooks.SessionStart.length, 2);
  assert.deepEqual(after.hooks.SessionStart[0], original.hooks.SessionStart[0], "a hook with a longer name is someone else's");
  assert.equal(after.hooks.SessionStart[1].matcher, "compact");
  assert.equal(after.hooks.PreToolUse.length, 1);
  assert.equal(after.hooks.PreToolUse[0].matcher, "^(Agent|Task)$");
  assert.equal(after.hooks.PreToolUse[0].hooks[0].command, after.hooks.SessionStart[1].hooks[0].command, "the existing events run this script");
  assert.equal(after.hooks.UserPromptSubmit.length, 1);
  assert.ok(!Object.hasOwn(after.hooks.UserPromptSubmit[0], "matcher"), "UserPromptSubmit has no matcher support");
  assert.equal(after.hooks.UserPromptSubmit[0].hooks[0].command, after.hooks.SessionStart[1].hooks[0].command, "the task reminder runs this script too");
  assert.deepEqual(after.hooks.Stop, original.hooks.Stop);
  assert.match(install("install").stdout, /already/);
  assert.equal(JSON.parse(readFileSync(settings, "utf8")).hooks.SessionStart.length, 2);
  assert.equal(JSON.parse(readFileSync(settings, "utf8")).hooks.PreToolUse.length, 1);
  assert.equal(JSON.parse(readFileSync(settings, "utf8")).hooks.UserPromptSubmit.length, 1);

  // A machine that registered only the after-compaction hook gets the second one on the next install.
  const older = join(root, "older.json");
  writeFileSync(older, JSON.stringify({ hooks: { SessionStart: after.hooks.SessionStart.slice(1) } }));
  assert.equal(install("install", older).status, 0);
  const upgraded = JSON.parse(readFileSync(older, "utf8"));
  assert.equal(upgraded.hooks.SessionStart.length, 1);
  assert.equal(upgraded.hooks.PreToolUse.length, 1);
  assert.equal(upgraded.hooks.UserPromptSubmit.length, 1);

  const twoHooks = join(root, "two-hooks.json");
  writeFileSync(twoHooks, JSON.stringify({ hooks: { SessionStart: after.hooks.SessionStart.slice(1), PreToolUse: after.hooks.PreToolUse } }));
  assert.equal(install("install", twoHooks).status, 0);
  assert.deepEqual(Object.fromEntries(Object.entries(JSON.parse(readFileSync(twoHooks, "utf8")).hooks).map(([event, entries]) => [event, entries.length])), { SessionStart: 1, PreToolUse: 1, UserPromptSubmit: 1 }, "an install over the old two hooks gains the third once");
  assert.match(install("install", twoHooks).stdout, /already in/);
  assert.equal(install("remove", twoHooks).status, 0);
  assert.deepEqual(JSON.parse(readFileSync(twoHooks, "utf8")), {}, "remove empties all three hooks");

  assert.equal(install("remove").status, 0);
  assert.deepEqual(JSON.parse(readFileSync(settings, "utf8")), original);
  assert.match(install("remove").stdout, /nothing to remove/);

  const absent = join(root, "none", "settings.json");
  assert.match(install("remove", absent).stdout, /nothing to remove/);
  assert.ok(!existsSync(absent), "removing from a missing file creates nothing");
  assert.equal(install("install", absent).status, 0);
  assert.equal(statSync(absent).mode & 0o777, 0o600, "a new settings file is the owner's alone");
  const fresh = JSON.parse(readFileSync(absent, "utf8"));
  assert.deepEqual(Object.keys(fresh.hooks), ["SessionStart", "PreToolUse", "UserPromptSubmit"], "a fresh install registers all three events");
  assert.ok(!Object.hasOwn(fresh.hooks.UserPromptSubmit[0], "matcher"), "a fresh UserPromptSubmit registration has no matcher");

  const target = join(root, "dotfiles", "settings.json");
  mkdirSync(dirname(target));
  writeFileSync(target, "{}");
  const link = join(root, "linked.json");
  symlinkSync(target, link);
  assert.equal(install("install", link).status, 0);
  assert.ok(lstatSync(link).isSymbolicLink(), "a linked settings file stays a link");
  assert.equal(JSON.parse(readFileSync(target, "utf8")).hooks.SessionStart[0].matcher, "compact");

  const broken = join(root, "broken.json");
  writeFileSync(broken, "{ not json");
  assert.equal(install("install", broken).status, 1);
  assert.equal(readFileSync(broken, "utf8"), "{ not json");
});

test("the adherence report counts what a task did", () => {
  const root = scratch();
  const day = (date) => ({ timestamp: `${date}T10:00:00.000Z` });
  const filler = [bash("ls"), bash("ls"), bash("ls"), bash("ls")];
  transcript(root, [
    // A task that only names the files, cuts one read short, and sends a status line.
    user("<command-name>/poteto-mode</command-name>\n<command-message>poteto-mode</command-message>", day("2026-11-01")),
    bash("echo /s/pstack-t3/SKILL.md /s/poteto-mode/playbooks/feature.md"),
    bash("cat /s/poteto-mode/playbooks/feature.md | head -20"),
    call("mcp__t3-code__send_to_user", { message: "working on it" }),
    call("mcp__t3-code__delegate_task", { task: "Read /s/pstack-t3/SKILL.md and /s/principle-x/SKILL.md" }),
    ...filler,
    user(COMPACTED, { ...day("2026-11-01"), isMeta: true }),
    // A later task with no command: the mode still holds. It reads everything and opens with a checklist.
    user("now add the retry", day("2026-11-20")),
    bash("cat /s/pstack-t3/SKILL.md /s/poteto-mode/playbooks/feature.md /s/principle-x/SKILL.md"),
    call("mcp__t3-code__send_to_user", { message: "Goal: retries.\n- [ ] 1. how\n- [ ] 2. architect\n- [ ] 3. delegate" }),
    call("Edit", { file_path: "/r/a.js" }),
    ...filler,
    user("<command-name>/compact</command-name>", day("2026-11-20")),
    user(COMPACTED, day("2026-11-20")),
    // The adapter was read whole before, but a compaction came between.
    user("and the docs", day("2026-11-21")),
    ...filler,
    bash("ls"),
    user("a quick question", day("2026-11-21")),
    bash("ls"),
    user("drop poteto-mode", day("2026-11-22")),
    user("an ordinary task", day("2026-11-22")),
    ...filler,
    bash("ls"),
  ], "project-a/session.jsonl");
  const report = (...args) => JSON.parse(execFileSync(process.execPath, [ADHERENCE, "--dir", root, "--json", ...args], { encoding: "utf8" }));

  const all = report();
  assert.deepEqual(all.tasks.map((task) => [task.invoked, task.adapter, task.playbook, task.principle, task.opening ?? null, task.openingFirst, task.delegated]), [
    [true, "-", "part", false, null, false, 1],
    [false, "full", "full", true, 2, true, 0],
    [false, "-", "-", false, null, false, 0],
  ]);
  assert.equal(all.short, 1, "a short task is counted, not shown");
  assert.deepEqual(all.compactions.map((compaction) => compaction.reread), [true, false]);

  const recent = report("--since", "2026-11-18");
  assert.equal(recent.tasks.length, 2);
  assert.equal(recent.compactions.length, 1, "--since also drops an older compaction");
});

test("the adherence report counts a native spawn the hook refused apart", () => {
  const root = scratch();
  const agent = (id) => JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id, name: "Agent", input: { prompt: "x" } }] } });
  const refusal = JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "agent-1", is_error: true, content: "PreToolUse:Agent hook error: pstack: poteto-mode is on" }] } });
  transcript(root, [user(INVOKE), agent("agent-1"), refusal, agent("agent-2"), result("ok"), bash("ls"), bash("ls"), bash("ls")], "project-b/session.jsonl");
  const [task] = JSON.parse(execFileSync(process.execPath, [ADHERENCE, "--dir", root, "--json"], { encoding: "utf8" })).tasks;
  assert.deepEqual([task.native, task.refused], [1, 1]);
});

test("the adherence report shows whether Comment Sicko was spawned before gh pr create", () => {
  const root = scratch();
  const SICKO = "---\nname: comment-sicko\n---\n\n# Comment Sicko\n\nYes... Ha ha ha... Yes!\n\nRead /s/pstack-t3/child.md first. Scope: the diff against main.";
  const pr = bash("git push -u origin x && gh pr create --repo o/r --base main --title t --body-file b.md");
  const agent = (id, input) => JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id, name: "Agent", input }] } });
  const refusal = JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "agent-1", is_error: true, content: "pstack: poteto-mode is on" }] } });
  const tasks = {
    "t3-brief": [call("mcp__t3-code__delegate_task", { task: SICKO }), pr],
    "native-type": [agent("agent-2", { subagent_type: "pstack:comment-sicko", prompt: "the diff" }), pr],
    "path-only": [call("mcp__t3-code__delegate_task", { task: "Act as /s/pstack-t3/agents/comment-sicko.md on the diff." }), pr],
    refused: [agent("agent-1", { subagent_type: "comment-sicko", prompt: "the diff" }), refusal, pr],
    "after-pr": [pr, call("mcp__t3-code__delegate_task", { task: SICKO })],
    "no-pr": [call("mcp__t3-code__delegate_task", { task: "implement it" })],
  };
  for (const [name, lines] of Object.entries(tasks)) transcript(root, [user(INVOKE), ...lines, bash("ls"), bash("ls"), bash("ls"), bash("ls")], `${name}/session.jsonl`);
  const rows = JSON.parse(execFileSync(process.execPath, [ADHERENCE, "--dir", root, "--json"], { encoding: "utf8" })).tasks;
  assert.deepEqual(Object.fromEntries(rows.map((row) => [row.project, row.sicko ?? null])), {
    "t3-brief": "spawned",
    "native-type": "spawned",
    "path-only": "skipped",
    refused: "skipped",
    "after-pr": "skipped",
    "no-pr": null,
  });
});
