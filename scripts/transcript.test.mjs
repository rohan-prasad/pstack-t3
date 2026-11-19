// Tests for the scripts that read Claude Code transcripts: the shared reader, the compaction hook and its installer,
// and the adherence report. Run with `node --test scripts/`.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { continuesTask, isDrop, isInvocation, promptOf, readsOf, userText } from "./transcript.mjs";

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
  assert.ok(!continuesTask("<command-name>/poteto-mode</command-name>"));
  assert.ok(!continuesTask("now fix the test"));
  assert.ok(isDrop("ok, drop poteto-mode for the rest of this thread"));
  assert.ok(isDrop("Drop poteto mode"));
  assert.ok(!isDrop("keep going in poteto mode"));
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

test("the installer changes only its own hook", () => {
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
  assert.match(install("install").stdout, /already/);
  assert.equal(JSON.parse(readFileSync(settings, "utf8")).hooks.SessionStart.length, 2);

  assert.equal(install("remove").status, 0);
  assert.deepEqual(JSON.parse(readFileSync(settings, "utf8")), original);
  assert.match(install("remove").stdout, /nothing to remove/);

  const absent = join(root, "none", "settings.json");
  assert.match(install("remove", absent).stdout, /nothing to remove/);
  assert.ok(!existsSync(absent), "removing from a missing file creates nothing");
  assert.equal(install("install", absent).status, 0);
  assert.equal(statSync(absent).mode & 0o777, 0o600, "a new settings file is the owner's alone");

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
