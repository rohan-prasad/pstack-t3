#!/usr/bin/env node
// Keeps a Claude thread on poteto-mode at two points where the skill text alone did not.
//
// After a compaction. A compaction replaces a thread's history with a summary, and the summary does not carry the
// skill text. Claude Code runs a SessionStart hook with the source `compact` right after one, and shows what the hook
// prints to the model. This hook prints the files to read again. The thread still has to read them.
//
// Before a spawn. pstack runs every subagent in the background on its role's model, and T3 Code sends such a child to
// `delegate_task`. T3 Code also tells a Claude thread to use Claude Code's own subagent tool for a foreground child on
// its own model, and threads that never read the adapter's spawning part took that path. Claude Code runs a PreToolUse
// hook before that tool, and this hook refuses it. The model reads the refusal as the tool's result.
//
// Both answer only in a thread where poteto-mode is on, or in a pstack delegate. Both stay quiet when the transcript
// cannot be read, so the thread goes on as it would without them.
//
//   node scripts/pstack-compaction-hook.mjs --install [settings.json]   register both in Claude Code's settings
//   node scripts/pstack-compaction-hook.mjs --remove [settings.json]    take them out again
//   node scripts/pstack-compaction-hook.mjs                             the hook itself, given Claude Code's JSON on stdin
//
// `./install.sh --hooks` and `./install.sh --remove-hooks` call the first two.

import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDrop, isInvocation, parse, readsOf, toolCalls, userText } from "./transcript.mjs";

const SELF = fileURLToPath(import.meta.url);
// Lines that can say something about pstack. The rest of a long transcript is skipped unparsed.
const RELEVANT = /poteto-mode|pstack-t3\/|playbooks\//;
// Where each hook goes in Claude Code's settings. `compact` is a SessionStart source. The other matcher is Claude Code's
// own subagent tool, under its current name and its older one.
const PLACEMENTS = [
  { event: "SessionStart", matcher: "compact" },
  { event: "PreToolUse", matcher: "Agent|Task" },
];
const SUBAGENT_TOOLS = new Set(["Agent", "Task"]);

// An absolute path in the text that ends with `suffix` and exists. A path can hold spaces, so every `/` to the left
// is tried as its start, the longest reading first.
function pathIn(text, suffix) {
  for (const line of text.split("\n")) {
    for (let end = line.indexOf(suffix); end !== -1; end = line.indexOf(suffix, end + 1)) {
      const upTo = line.slice(0, end + suffix.length);
      for (let start = upTo.indexOf("/"); start !== -1 && start < end; start = upTo.indexOf("/", start + 1)) {
        if (existsSync(upTo.slice(start))) return upTo.slice(start);
      }
    }
  }
  return undefined;
}

// What the transcript says about pstack: whether the mode is on, whether this is a delegate, where the skills are,
// and which playbooks the thread read, the latest last.
function read(transcript) {
  const found = { on: false, child: false, skills: undefined, skill: undefined, adapter: undefined, playbooks: [] };
  let opened = false;
  for (const line of readFileSync(transcript, "utf8").split("\n")) {
    if (opened && !RELEVANT.test(line)) continue;
    const record = parse(line);
    if (!record || record.isSidechain) continue;
    for (const call of toolCalls(record)) {
      for (const read of readsOf(call)) {
        const name = read.path.match(/playbooks\/([a-z-]+)\.md$/)?.[1];
        if (name) found.playbooks = [...found.playbooks.filter((other) => other !== name), name];
      }
    }
    const prompt = userText(record);
    if (prompt === undefined) continue;
    if (record.isMeta) {
      // Claude Code puts the skill's folder at the top of the text it injects for the command.
      const base = prompt.match(/Base directory for this skill: ([^\n]+)\/poteto-mode[ \t]*(?:\n|$)/);
      if (base) found.skills = base[1];
      if (isInvocation(prompt)) found.on = true;
      continue;
    }
    if (!opened) {
      opened = true;
      // A pstack child's brief opens its thread and names the child adapter, as the adapter's spawning rules require.
      found.adapter = pathIn(prompt, "pstack-t3/child.md");
      found.child = found.adapter !== undefined;
      if (found.child) found.skill = pathIn(prompt, "poteto-mode/SKILL.md");
    }
    // The later of the two wins, so a thread the operator took out of the mode stays out.
    if (isInvocation(prompt)) found.on = true;
    else if (isDrop(prompt)) found.on = false;
  }
  return found;
}

// The skills folder of a thread where the mode is on: the one Claude Code loaded the skill from, or this checkout's.
const skillsOf = (found) => [found.skills, join(dirname(SELF), "..", "skills")].find((dir) => dir && existsSync(join(dir, "poteto-mode", "SKILL.md")));

function reminder(found) {
  const again = "Before you reply or use any other tool, read each of these files again, in full:";
  let lines;
  let skills;
  if (found.on) {
    skills = skillsOf(found);
    if (!skills) return "";
    lines = [`pstack: poteto-mode is on in this thread, and the compaction dropped the skill text. ${again}`, `- ${join(skills, "poteto-mode", "SKILL.md")}`, `- ${join(skills, "pstack-t3", "SKILL.md")}`];
  } else {
    skills = dirname(dirname(found.adapter));
    lines = [`pstack: this thread is a pstack delegate, and the compaction dropped what it read. ${again}`, `- ${found.adapter}`];
    if (found.skill) lines.push(`- ${found.skill}`);
  }
  // A run reads its own playbook and then others, such as Opening a PR, so one name is not enough to find its place.
  const playbooks = found.playbooks.map((name) => join(skills, "poteto-mode", "playbooks", `${name}.md`)).filter((path) => existsSync(path)).slice(-4);
  playbooks.forEach((path, at) => lines.push(`- ${path}, a playbook this thread read${at === playbooks.length - 1 ? " last" : ""}`));
  if (found.on && playbooks.length === 0) lines.push("- the playbook that fits the task, from the Playbooks section of the first file");
  if (found.on) lines.push("Skip this only if the operator has told you to drop poteto-mode.");
  return `${lines.join("\n")}\n`;
}

// Why a call to Claude Code's own subagent tool is refused. Empty when the call may go ahead.
function refusal(found) {
  if (found.on) {
    const spawning = join(skillsOf(found) ?? "<skills>", "pstack-t3", "spawning.md");
    return (
      "pstack: poteto-mode is on, so a subagent is a `delegate_task` child on its role's model, never this tool. " +
      `Load \`delegate_task\` with your tool search if it is deferred. Read ${spawning} and ~/.agents/pstack-models.md before the first spawn. ` +
      "A step that delegates stays delegated, so do not do the child's work yourself instead."
    );
  }
  if (found.child) {
    const spawning = join(dirname(found.adapter), "spawning.md");
    return `pstack: this thread is a pstack delegate. Spawn only when your task says you may, and then with \`delegate_task\`, as ${spawning} says. Otherwise do the step yourself and say so in your report.`;
  }
  return "";
}

function runHook() {
  const input = parse(readFileSync(0, "utf8"));
  if (!input?.transcript_path || !existsSync(input.transcript_path)) return;
  if (input.hook_event_name === "PreToolUse") {
    // The registration matches the subagent tool only. This guards a registration that matches more.
    if (!SUBAGENT_TOOLS.has(input.tool_name)) return;
    const reason = refusal(read(input.transcript_path));
    if (reason) process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } })}\n`);
    return;
  }
  // The registration matches `compact` only. This guards a registration with no matcher, or on another event.
  if (input.source !== "compact") return;
  const found = read(input.transcript_path);
  if (found.on || found.child) process.stdout.write(reminder(found));
}

// Registers or removes the hooks. It leaves every other setting, the file's mode, and a link to the file as they were.
function register(action, path) {
  // A settings file kept in a dotfiles folder is a link. Write through it, not over it.
  const file = existsSync(path) ? realpathSync(path) : path;
  let settings = {};
  if (existsSync(file)) {
    settings = parse(readFileSync(file, "utf8"));
    if (settings === undefined || settings === null || typeof settings !== "object" || Array.isArray(settings)) {
      console.log(`${path} is not a JSON object, so it is left unchanged. Fix it and run this again.`);
      process.exit(1);
    }
  }
  // Ours is a command that ends with this script's name. A longer name, such as a backup copy's, is someone else's.
  const mine = new RegExp(`[/\\\\"' ]${basename(SELF).replace(/\./g, "\\.")}["']?\\s*$`);
  const ours = (hook) => typeof hook?.command === "string" && mine.test(hook.command);
  const had = PLACEMENTS.some(({ event }) => (settings.hooks?.[event] ?? []).some((entry) => (entry.hooks ?? []).some(ours)));
  if (action === "remove" && !had) {
    console.log(`no pstack hooks in ${path}, so nothing to remove`);
    return;
  }
  const hooks = { ...settings.hooks };
  for (const { event, matcher } of PLACEMENTS) {
    const entries = (hooks[event] ?? []).map((entry) => ({ ...entry, hooks: (entry.hooks ?? []).filter((hook) => !ours(hook)) })).filter((entry) => entry.hooks.length > 0);
    if (action === "install") {
      // The absolute path of this Node, because a hook does not always get the shell's PATH.
      entries.push({ matcher, hooks: [{ type: "command", command: `"${process.execPath}" "${SELF}"`, timeout: 20 }] });
    }
    if (entries.length > 0) hooks[event] = entries;
    else delete hooks[event];
  }
  const next = { ...settings, hooks };
  if (Object.keys(next.hooks).length === 0) delete next.hooks;
  if (JSON.stringify(next) === JSON.stringify(settings)) {
    console.log(`the pstack hooks are already in ${path}`);
    return;
  }
  // Settings can hold private values, so a new file is the owner's alone and an old one keeps its mode.
  const mode = existsSync(file) ? statSync(file).mode & 0o777 : 0o600;
  const draft = `${file}.pstack-${process.pid}.tmp`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(draft, `${JSON.stringify(next, null, 2)}\n`, { mode });
  chmodSync(draft, mode);
  renameSync(draft, file);
  console.log(
    action === "install"
      ? `added the pstack hooks to ${path}. They apply to Claude threads that start from now on.`
      : `removed the pstack hooks from ${path}`,
  );
}

const [flag, target] = process.argv.slice(2);
if (flag === "--install" || flag === "--remove") {
  register(flag.slice(2), target ?? join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "settings.json"));
} else if (flag === undefined) {
  runHook();
} else {
  console.log(`unknown option ${flag}\nusage: node scripts/pstack-compaction-hook.mjs [--install|--remove] [settings.json]`);
  process.exit(2);
}
