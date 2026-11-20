#!/usr/bin/env node
// Measures how far each poteto-mode task in a T3 Code Claude thread followed the skill.
//
//   node scripts/adherence.mjs                     every task in ~/.claude/projects
//   node scripts/adherence.mjs --since 2026-11-20  tasks and compactions from that date on
//   node scripts/adherence.mjs --dir DIR           another transcript folder
//   node scripts/adherence.mjs --json              the same numbers as JSON
//
// It reads Claude Code's session transcripts, which record every tool call. The mode turns on where the operator runs
// /poteto-mode (T3 Code sends `$poteto-mode` as that command) and stays on until they write "drop poteto-mode". Each
// prompt the operator sends while it is on starts a task. Child completions, background-command exits, compactions,
// and commands such as /compact or /model continue the task they arrive in.
//
// A file counts as read only when a tool call read it: the Read tool, or `cat`, `sed`, `head`, and the like in the
// shell. A path that a call only names, such as one in a child's brief, does not count. "part" means every read of
// the file was cut, for example by `head` or a line range. "held" means the thread read the whole adapter in an
// earlier task and no compaction came between. An opening counts when `send_to_user` carried a checklist.
// It prints dates and counts only, never prompt text. Codex, Pi, and Grok threads keep their own transcripts and are
// not read. The transcript format is Claude Code's own, so a count of zero means "check the format", not "no tasks".

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { continuesTask, isCompaction, isDrop, isInvocation, parse, readsOf, refusedCalls, toolCalls, userText } from "./transcript.mjs";

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const DIR = option("--dir") ?? join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "projects");
const SINCE = option("--since") ?? "";
// A task this short is a follow-up question. It is counted, but kept out of the table and the shares.
const MIN_TOOLS = 5;

const ADAPTER = /pstack-t3\/SKILL\.md$/;
const PLAYBOOK = /playbooks\/[a-z-]+\.md$/;
const PRINCIPLE = /principle-[^/\s]*\/SKILL\.md$/;
const SKILL_TEXT = /pstack-t3\/(SKILL|child)\.md$|poteto-mode\/SKILL\.md$|playbooks\/[a-z-]+\.md$/;
const SPAWN = (name) => name.endsWith("delegate_task") || name === "Agent" || name === "Task";
const NATIVE = (name) => name === "Agent" || name === "Task";
// The reason pstack's hook gives when it refuses Claude Code's own subagent tool.
const REFUSAL = /\bpstack:/;
const EDIT = new Set(["Edit", "Write", "NotebookEdit"]);
const isChecklist = (message) => typeof message === "string" && (message.match(/^\s*(?:[-*]|\d+[.)])\s+\S/gm) ?? []).length >= 3;

// One session's tasks while the mode was on, and each compaction in that time with whether the skill text came back.
function sessionIn(path) {
  const tasks = [];
  const compactions = [];
  const refused = new Set();
  let on = false;
  let held = false;
  let task;
  let waiting;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const record = parse(line);
    if (!record) continue;
    for (const id of refusedCalls(record, REFUSAL)) refused.add(id);
    for (const call of toolCalls(record)) {
      const reads = readsOf(call);
      if (waiting && reads.some((read) => SKILL_TEXT.test(read.path))) waiting.reread = true;
      if (reads.some((read) => read.whole && ADAPTER.test(read.path))) held = true;
      if (task) task.calls.push({ id: call.id, name: call.name ?? "", input: call.input ?? {}, reads });
    }
    if (task && record.type === "assistant") task.model ??= record.message?.model;
    const prompt = userText(record);
    if (prompt === undefined) continue;
    const at = (record.timestamp ?? "").slice(0, 16);
    if (isCompaction(prompt)) {
      held = false;
      if (on) compactions.push((waiting = { at, reread: false }));
      continue;
    }
    const invoked = isInvocation(prompt);
    // Injected text, such as a skill's body, is not a task. The command itself is one wherever it is recorded.
    if (!invoked && (record.isMeta || continuesTask(prompt))) continue;
    // Running the skill again puts its text back.
    if (invoked && waiting) waiting.reread = true;
    if (invoked) on = true;
    else if (on && isDrop(prompt)) on = false;
    task = on ? { started: at, invoked, held, calls: [], model: undefined } : undefined;
    if (task) tasks.push(task);
  }
  return { tasks, compactions, refused };
}

// `refused` holds the native spawns that the hook turned away. They count apart, because they never ran.
function measure(task, refused) {
  const { calls } = task;
  const reads = calls.flatMap((call) => call.reads);
  const state = (pattern) => {
    const hits = reads.filter((read) => pattern.test(read.path));
    return hits.some((read) => read.whole) ? "full" : hits.length > 0 ? "part" : "-";
  };
  const firstWork = calls.findIndex((call) => (SPAWN(call.name) && !refused.has(call.id)) || EDIT.has(call.name));
  const opening = calls.findIndex((call) => call.name.endsWith("send_to_user") && isChecklist(call.input.message));
  const adapter = state(ADAPTER);
  return {
    tools: calls.length,
    adapter: adapter === "full" || !task.held ? adapter : "held",
    playbook: state(PLAYBOOK),
    principle: reads.some((read) => PRINCIPLE.test(read.path)),
    // The opening's place among the task's tool calls, counted from 1.
    opening: opening === -1 ? undefined : opening + 1,
    openingFirst: opening !== -1 && (firstWork === -1 || opening < firstWork),
    todo: calls.some((call) => ["TodoWrite", "TaskCreate"].includes(call.name)),
    delegated: calls.filter((call) => call.name.endsWith("delegate_task")).length,
    native: calls.filter((call) => NATIVE(call.name) && !refused.has(call.id)).length,
    refused: calls.filter((call) => NATIVE(call.name) && refused.has(call.id)).length,
  };
}

if (!existsSync(DIR)) {
  console.log(`No transcript folder at ${DIR}.`);
  process.exit(1);
}

const rows = [];
const compactions = [];
let short = 0;
for (const project of readdirSync(DIR)) {
  const folder = join(DIR, project);
  if (!statSync(folder).isDirectory()) continue;
  for (const name of readdirSync(folder).filter((name) => name.endsWith(".jsonl"))) {
    const session = sessionIn(join(folder, name));
    compactions.push(...session.compactions.filter((compaction) => compaction.at.slice(0, 10) >= SINCE));
    for (const task of session.tasks) {
      if (task.started.slice(0, 10) < SINCE) continue;
      const result = measure(task, session.refused);
      if (result.tools < MIN_TOOLS) {
        short += 1;
        continue;
      }
      rows.push({ ...result, started: task.started, invoked: task.invoked, model: (task.model ?? "?").replace(/^claude-/, ""), project: basename(folder).replace(/^.*-worktrees-/, "").replace(/-t3-[0-9a-f-]+$/, "") });
    }
  }
}
rows.sort((a, b) => a.started.localeCompare(b.started));

if (args.includes("--json")) {
  console.log(JSON.stringify({ tasks: rows, short, compactions }, null, 2));
  process.exit(0);
}

if (rows.length === 0) {
  console.log(`No poteto-mode task with ${MIN_TOOLS} or more tool calls in ${DIR}${SINCE ? ` since ${SINCE}` : ""}.`);
  if (short > 0) console.log(`${short} shorter ${short === 1 ? "task was" : "tasks were"} found.`);
  else console.log("If you have run the skill, the transcript format may have changed. A transcript should hold a prompt that starts with:\n  <command-message>poteto-mode</command-message>");
  process.exit(0);
}

const mark = (value) => (value ? "yes" : "-");
console.log("started           project          model       start   tools adapter playbook principle opening   spawns(t3/own)");
for (const row of rows) {
  console.log(
    [
      row.started.padEnd(17),
      row.project.slice(0, 16).padEnd(16),
      row.model.slice(0, 11).padEnd(11),
      (row.invoked ? "command" : "later").padEnd(7),
      String(row.tools).padStart(5),
      row.adapter.padEnd(7),
      row.playbook.padEnd(8),
      mark(row.principle).padEnd(9),
      (row.opening === undefined ? "-" : `call ${row.opening}`).padEnd(9),
      `${row.delegated}/${row.native}`,
    ].join(" "),
  );
}

const report = (title, group) => {
  const count = (test) => group.filter(test).length;
  const share = (test) => `${count(test)} of ${group.length}`;
  console.log("");
  console.log(`${title}: ${group.length}`);
  if (group.length === 0) return;
  console.log(`  had the whole adapter in context          ${share((row) => row.adapter === "full" || row.adapter === "held")}, read only part of it in ${count((row) => row.adapter === "part")}`);
  console.log(`  read a whole playbook                     ${share((row) => row.playbook === "full")}, read only part of one in ${count((row) => row.playbook === "part")}`);
  console.log(`  read a principle leaf                     ${share((row) => row.principle)}`);
  console.log(`  sent an opening with a checklist          ${share((row) => row.opening !== undefined)}, before the first edit or spawn in ${count((row) => row.openingFirst)}`);
  console.log(`  used a todo tool                          ${share((row) => row.todo)}`);
  console.log(`  spawned with delegate_task                ${share((row) => row.delegated > 0)}`);
  console.log(`  spawned with the provider's own tool      ${share((row) => row.native > 0)}, and the hook refused one in ${count((row) => row.refused > 0)}`);
};
report("tasks that started with the command", rows.filter((row) => row.invoked));
report("tasks that came later while the mode held", rows.filter((row) => !row.invoked));
console.log("");
console.log(`tasks under ${MIN_TOOLS} tool calls, left out: ${short}`);
console.log(`compactions while the mode was on: ${compactions.length}, skill text read again after ${compactions.filter((compaction) => compaction.reread).length}`);
