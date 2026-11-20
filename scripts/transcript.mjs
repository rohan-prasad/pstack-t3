// What Claude Code's session transcripts look like, in one place. The compaction hook and the adherence script both
// read them. The format is Claude Code's own, so a change in it is fixed here once.

const SKILL = "(?:[a-z0-9-]+:)?poteto-mode";
// The record Claude Code writes when the operator runs the skill. The envelope opens the prompt, so a prompt that
// only quotes the tag does not count.
const INVOCATION = new RegExp(`^\\s*(?:<command-message>${SKILL}</command-message>\\s*)?<command-name>/${SKILL}</command-name>`);
// The phrase the adapter gives the operator for ending the mode.
const DROP = /\bdrop poteto[- ]mode\b/i;
// Prompts the operator did not type as a new task: a child's completion, a background command's exit, a compaction
// summary, a built-in command such as /compact, and an interrupt.
const CONTINUES = /^\s*(Delegated task |This session is being continued|<task-notification|<local-command|<command-name>|\[Request interrupted)/;
// T3 Code's wake for a PR the thread watches. The whole header, so an operator's own "Update on pull request #3,
// please" stays a new task.
const PR_WAKE = /^\s*Update on pull request #\d+ \(https?:\/\/[^)\s]+\), which T3 Code is watching for you:/;
// T3 Code opens a delegated child's thread with this line, then the brief.
const CHILD_BRIEF = /^\s*Act as (?:the|a)\b[^\n.]*\bsub-?agent\b/i;

const READS_WHOLE = new Set(["cat", "bat", "less", "more", "nl"]);
const READS_PART = new Set(["head", "tail"]);
// A later stage of a pipeline that keeps only part of what the first stage read.
const CUTS = new Set(["head", "tail", "sed", "cut", "awk", "grep", "rg", "wc"]);

export function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((block) => block?.type === "text").map((block) => block.text ?? "").join("\n");
}

export function parse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

// The text of a user-side record. Undefined for a tool result and for a record from inside a subagent. A tool result
// can quote any marker, so it never counts as one.
export function userText(record) {
  if (record?.type !== "user" || record.isSidechain) return undefined;
  const content = record.message?.content;
  if (Array.isArray(content) && content.some((block) => block?.type === "tool_result")) return undefined;
  const text = textOf(content);
  return text.trim() ? text : undefined;
}

// The prompt a user-side record carries. A record the harness injected, such as a skill's text, is not a prompt.
// The command and the compaction summary are still found in one, through `userText`.
export const promptOf = (record) => (record?.isMeta ? undefined : userText(record));

export const isInvocation = (prompt) => INVOCATION.test(prompt);
export const isDrop = (prompt) => DROP.test(prompt);
export const isCompaction = (prompt) => prompt.trimStart().startsWith("This session is being continued");
export const continuesTask = (prompt) => !isInvocation(prompt) && (CONTINUES.test(prompt) || PR_WAKE.test(prompt));
export const isChildBrief = (prompt) => CHILD_BRIEF.test(prompt);

// The ids of the tool calls a hook refused with a reason that matches `reason`. Claude Code reports a refusal as the
// call's error result, with the hook's reason in it.
export function refusedCalls(record, reason) {
  if (record?.type !== "user" || record.isSidechain) return [];
  const content = record.message?.content;
  return (Array.isArray(content) ? content : [])
    .filter((block) => block?.type === "tool_result" && block.is_error && reason.test(textOf(block.content)))
    .map((block) => block.tool_use_id);
}

export function toolCalls(record) {
  if (record?.type !== "assistant" || record.isSidechain) return [];
  const content = record.message?.content;
  return (Array.isArray(content) ? content : []).filter((block) => block?.type === "tool_use");
}

// The words one shell word stands for, after a loop variable and one pair of braces are filled in.
function expand(word, loops) {
  const bare = word.replace(/^["']|["']$/g, "");
  for (const [name, items] of loops) {
    const use = new RegExp(`\\$\\{?${name}\\}?`, "g");
    if (use.test(bare)) return items.flatMap((item) => expand(bare.replace(use, item), new Map()));
  }
  const braces = bare.match(/^(.*)\{([^{}]+)\}(.*)$/);
  return braces ? braces[2].split(",").map((item) => `${braces[1]}${item}${braces[3]}`) : [bare];
}

// The files a tool call read, each with whether the read took the whole file. A path that a call only names, such as
// one in a child's brief, a message, or an `ls`, is not a read.
export function readsOf(call) {
  const input = call?.input ?? {};
  if (call?.name === "Read") {
    return typeof input.file_path === "string" ? [{ path: input.file_path, whole: input.offset === undefined && input.limit === undefined }] : [];
  }
  if (call?.name !== "Bash" || typeof input.command !== "string") return [];
  const reads = [];
  const loops = new Map();
  for (const raw of input.command.split(/;|&&|\|\||\n/)) {
    const segment = raw.trim().replace(/^(?:do|then|else)\s+/, "");
    const loop = segment.match(/^for\s+(\w+)\s+in\s+(.+)$/);
    if (loop) {
      loops.set(loop[1], loop[2].trim().split(/\s+/).flatMap((word) => expand(word, new Map())));
      continue;
    }
    // A heredoc feeds a command its text. It reads no file.
    if (segment.includes("<<")) continue;
    const [first, ...later] = segment.split("|").map((stage) => stage.trim());
    const [verb, ...words] = first.split(/\s+/);
    const cut = later.some((stage) => CUTS.has(stage.split(/\s+/)[0]));
    let whole;
    if (READS_WHOLE.has(verb)) whole = !cut;
    else if (READS_PART.has(verb)) whole = false;
    else if (verb === "sed") whole = !words.includes("-n") && !cut;
    else continue;
    for (const word of words) {
      if (/^\d*>/.test(word)) break;
      if (word.startsWith("-")) continue;
      // A file here has a folder or an extension. That leaves out a sed script such as `1,6d`.
      for (const path of expand(word, loops)) if (/[./]/.test(path)) reads.push({ path, whole });
    }
  }
  return reads;
}
