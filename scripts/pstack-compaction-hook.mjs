#!/usr/bin/env node
// Keeps a Claude thread on poteto-mode at three points where the skill text alone did not.
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
// At the start of a task. T3 Code loads the skill text once per thread. Claude Code runs a UserPromptSubmit hook when
// a prompt arrives, before it writes the prompt to the transcript, and adds what the hook prints to the model's context.
//
//   node scripts/pstack-compaction-hook.mjs --install [settings.json]   register all three in Claude Code's settings
//   node scripts/pstack-compaction-hook.mjs --remove [settings.json]    take all three out again
//   node scripts/pstack-compaction-hook.mjs                             the hook itself, given Claude Code's JSON on stdin
//
// `./install.sh --hooks` and `./install.sh --remove-hooks` call the first two.

import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { continuesTask, isChildBrief, isDrop, isInvocation, parse, readsOf, toolCalls, typedCommand, userText } from "./transcript.mjs";

const SELF = fileURLToPath(import.meta.url);
// Lines that can say something about pstack: the command, a drop in any spelling, a skill's injected text, a read of
// a playbook, and the operator's own prompts. The rest of a long transcript, mostly tool results, is skipped unparsed.
const RELEVANT = /poteto[- ]mode|pstack-t3\/|playbooks\/|Base directory for this skill/i;
const relevant = (line) => RELEVANT.test(line) || (line.includes('"type":"user"') && !line.includes('"tool_use_id"'));
// Where each hook goes in Claude Code's settings. `compact` is a SessionStart source. The other matcher is Claude Code's
// own subagent tool, under its current name and its older one, and no tool whose name only starts with either.
const PLACEMENTS = [
  { event: "SessionStart", matcher: "compact" },
  { event: "PreToolUse", matcher: "^(Agent|Task)$" },
  { event: "UserPromptSubmit" },
];
const PROMPT_KINDS = [
  ["invocation", isInvocation],
  ["continuation", continuesTask],
  ["drop", isDrop],
  ["command", (prompt) => typedCommand(prompt) !== undefined],
  ["message", () => true],
];
const TASK_REMINDER = "pstack: poteto-mode is on. Before your first edit or spawn on a new task, send the opening with `send_to_user`, with the playbook's steps as a checklist. A step marked Mandatory never ends as a skip, so Feature's step 4 delegates the code even when it looks small. A skill a step names counts only once you read its file.\n";
const SUBAGENT_TOOLS = new Set(["Agent", "Task"]);
// Subagent types that stand in for a tool the session lacks, such as WebFetch. A call to one is a tool call, not a spawn.
const TOOL_STAND_INS = new Set(["web-fetch"]);

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

// What the transcript says about pstack: whether T3 Code started the session, whether the mode is on, whether this is
// a delegate, where the skills are, which playbooks the thread read, the latest last, and which skill from outside
// poteto-mode the operator is running.
function read(transcript) {
  const found = { t3: false, on: false, child: false, skills: undefined, skill: undefined, adapter: undefined, playbooks: [], other: undefined };
  let history;
  try {
    history = readFileSync(transcript, "utf8");
  } catch (error) {
    // Claude Code creates the transcript after the first prompt's hook runs.
    if (error.code !== "ENOENT") throw error;
    history = "";
  }
  let opened = false;
  for (const line of history.split("\n")) {
    // Claude Code stamps each record with what started it, and T3 Code starts it as `t3-code`.
    if (!found.t3 && line.includes('"entrypoint":"t3-code"')) found.t3 = true;
    if (opened && !relevant(line)) continue;
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
      // Claude Code puts the skill's folder at the top of the text it injects for a skill's command. A skill other
      // than poteto-mode is its own task until the operator's next message.
      const base = prompt.match(/Base directory for this skill: ([^\n]+?)[ \t]*(?:\n|$)/)?.[1];
      if (base && basename(base) === "poteto-mode") found.skills = dirname(base);
      if (base) found.other = basename(base) === "poteto-mode" ? undefined : base;
      if (isInvocation(prompt)) found.on = true;
      continue;
    }
    if (!opened) {
      opened = true;
      // A pstack child's brief comes after T3 Code's first line for a child, and names the child adapter, as the
      // adapter's spawning rules require.
      if (isChildBrief(prompt)) {
        found.adapter = pathIn(prompt, "pstack-t3/child.md");
        found.child = found.adapter !== undefined;
        if (found.child) found.skill = pathIn(prompt, "poteto-mode/SKILL.md");
      }
    }
    // A wake, a child's report, or a summary only quotes other text. Only the operator's own message changes the mode.
    if (continuesTask(prompt)) continue;
    found.other = undefined;
    // The later of the two wins, so a thread the operator took out of the mode stays out.
    if (isInvocation(prompt)) found.on = true;
    else if (isDrop(prompt)) found.on = false;
  }
  return found;
}

// The skills folder of a thread where the mode is on: the one Claude Code loaded the skill from, or this checkout's.
const skillsOf = (found) => [found.skills, join(dirname(SELF), "..", "skills")].find((dir) => dir && existsSync(join(dir, "poteto-mode", "SKILL.md")));

function taskReminder(found, prompt) {
  if (typeof prompt !== "string" || (!found.t3 && !process.env.T3CODE_THREAD_ID) || found.child) return "";
  const kind = PROMPT_KINDS.find(([, matches]) => matches(prompt))[0];
  if (kind === "invocation") return TASK_REMINDER;
  if (!found.on) return "";
  if (kind === "message") return TASK_REMINDER;
  const skills = skillsOf(found);
  return kind === "command" && skills && existsSync(join(skills, typedCommand(prompt), "SKILL.md")) ? TASK_REMINDER : "";
}

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

// Why a call to Claude Code's own subagent tool is refused. Empty when the call may go ahead: outside T3 Code, where
// that tool is how pstack spawns, outside the mode, while the operator runs a skill from outside pstack, and for a
// subagent type that stands in for a missing tool.
function refusal(found, toolInput) {
  if (!found.t3 && !process.env.T3CODE_THREAD_ID) return "";
  if (TOOL_STAND_INS.has(toolInput?.subagent_type)) return "";
  if (found.on) {
    const skills = skillsOf(found);
    if (found.other && dirname(found.other) !== skills) return "";
    const spawning = join(skills ?? "<skills>", "pstack-t3", "spawning.md");
    return (
      "pstack: poteto-mode is on, so a subagent is a `delegate_task` child on its role's model, never this tool. " +
      `Load \`delegate_task\` with your tool search if it is deferred. Read ${spawning} and ~/.agents/pstack-models.md before the first spawn. ` +
      "A step that delegates stays delegated, so do not do the child's work yourself instead. Only the operator lifts this, by writing `drop poteto-mode`."
    );
  }
  if (found.child) {
    const spawning = join(dirname(found.adapter), "spawning.md");
    return `pstack: this thread is a pstack delegate. Spawn only when your task says you may, and then with \`delegate_task\`, as ${spawning} says. Otherwise do the step yourself and say so in your report.`;
  }
  return "";
}

function runHook() {
  let input;
  try {
    input = parse(readFileSync(0, "utf8"));
  } catch {
    return;
  }
  if (!input?.transcript_path) return;
  const beforeTool = input.hook_event_name === "PreToolUse";
  const promptSubmit = input.hook_event_name === "UserPromptSubmit";
  // The SessionStart and PreToolUse registrations each match one source or one tool. This guards one that matches more.
  if (!promptSubmit && (beforeTool ? !SUBAGENT_TOOLS.has(input.tool_name) : input.source !== "compact")) return;
  let found;
  try {
    found = read(input.transcript_path);
  } catch {
    // A transcript the hook cannot read leaves the thread as it would be with no hook.
    return;
  }
  if (promptSubmit) {
    process.stdout.write(taskReminder(found, input.prompt));
  } else if (beforeTool) {
    const reason = refusal(found, input.tool_input);
    if (reason) process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } })}\n`);
  } else if (found.on || found.child) {
    process.stdout.write(reminder(found));
  }
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
  for (const { event, ...placement } of PLACEMENTS) {
    const entries = (hooks[event] ?? []).map((entry) => ({ ...entry, hooks: (entry.hooks ?? []).filter((hook) => !ours(hook)) })).filter((entry) => entry.hooks.length > 0);
    if (action === "install") {
      // The absolute path of this Node, because a hook does not always get the shell's PATH.
      entries.push({ ...placement, hooks: [{ type: "command", command: `"${process.execPath}" "${SELF}"`, timeout: 20 }] });
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
