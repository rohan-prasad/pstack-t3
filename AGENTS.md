# p3-stack contributor guide

p3-stack is pstack, unchanged, plus one adapter that maps its Cursor names to T3 Code. Read [README.md](README.md) for the layout.

## Rules

- Never edit `skills/`. `scripts/generate.mjs` writes it. A change you want in a skill belongs upstream in [cursor/plugins](https://github.com/cursor/plugins/tree/main/pstack), or in the adapter when it is about T3.
- The adapter, `docs/harness/t3-code.md`, and the T3 examples in `docs/harness/t3-code/` are the only hand-written skill text. An example replaces a pstack example only where T3 tools change it, and links to the original. The adapter mirrors pstack's `docs/harness/claude-code.md`, so keep its sections, table shape, and voice: terse, declarative, one fact per sentence.
- Every adapter row names a T3 tool exactly as the tool calls itself (`delegate_task`, `watch_pull_request`, `schedule_task`, `link_pull_request`, `t3_thread_read`, `preview_*`, `device_*`), or says to skip with the line. The generator checks each name against `t3-tools.json`.
- A row never tells a thread to break a rule that T3 Code gives it. Map the pstack step onto the T3 rule. The T3 rule decides how the step runs, and the row keeps the step from being dropped.
- A row never grants what only the operator can. Where T3 Code says "only when asked", the answer is a line in `~/.agents/pstack-models.md` that `/setup-pstack` writes, such as `# browser proof`. The row reads that line, and with no line it follows T3 Code's rule.
- `TERMS` in `scripts/generate.mjs` lists the Cursor names the generator looks for. Each `key` must appear verbatim in the first cell of a table row, or in a heading, of the adapter or of a part it links to. When pstack starts using a new Cursor feature, add its term and its row together.
- Every top-level run reads the adapter before its playbook, so the generator holds it to 1,900 words. A part of the adapter that only one skill or one kind of step needs lives in its own file in `docs/harness/t3-code/`, such as `spawning.md`, `paths.md`, and `waking.md`. The adapter links to each part from the row or heading that says when to read it, and the generator fails on a part with no link.
- `docs/harness/t3-code/child.md` is the adapter for a delegated child. Every child reads it, so the generator holds it to 500 words. Put a row there only when a child that spawns nothing needs it. A row there never says more than the adapter's row.
- After any change, run `node scripts/generate.mjs` and commit `skills/` with it. CI runs `node scripts/generate.mjs --check`.

- `scripts/pstack-compaction-hook.mjs` is the Claude Code hook that `./install.sh --hooks` registers. It finds a mode thread by the `/poteto-mode` command in the transcript, and a delegate by the child adapter's path in its brief. Keep its output short, because Claude Code adds it to the thread's context after every compaction.
- `scripts/transcript.mjs` holds what the hook and `scripts/adherence.mjs` know about Claude Code's transcript format. After a change to any of the three, run `node --test scripts/transcript.test.mjs`. CI runs it too.

## Updating the T3 tool list

`t3-tools.json` lists the tools T3 Code gives a thread. Refresh it after a T3 Code update. Do it in a top-level Claude thread, because a delegated child is given fewer tools. It has no `watch_pull_request`, for one. List every tool the session offers whose name starts with `mcp__t3-code__`, deferred ones included, drop the prefix, and write the sorted names to `tools`. Set `t3Code` and `listed`. A tool that only some providers offer says so in its description, so the row that names it names the provider too. Then run `node scripts/generate.mjs`. A `FAIL` line names each tool the adapter still calls by an old name. Read the new tool's description before you fix the row, because a merged tool often takes an `action` field.

A snake-case name in the adapter that is not a T3 tool, such as a Cursor field, goes in `NOT_TOOLS` in `scripts/generate.mjs`.

## Updating pstack

Run `node scripts/generate.mjs --bump`. It pins pstack's `main` in `pstack.lock.json` and regenerates. A `FAIL` line names the term or link to fix. A `REVIEW` line is new skill text that names a tool, a field, or Cursor. The term list cannot see a new mechanic, such as a new kind of wake, a new subagent field, or a tracker, so read every `REVIEW` line and the upstream diff, and add a row and a term before you commit.
