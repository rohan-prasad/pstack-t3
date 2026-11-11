# p3-stack contributor guide

p3-stack is pstack, unchanged, plus one adapter that maps its Cursor names to T3 Code. Read [README.md](README.md) for the layout.

## Rules

- Never edit `skills/`. `scripts/generate.mjs` writes it. A change you want in a skill belongs upstream in [cursor/plugins](https://github.com/cursor/plugins/tree/main/pstack), or in the adapter when it is about T3.
- The adapter, `docs/harness/t3-code.md`, and the T3 examples in `docs/harness/t3-code/` are the only hand-written skill text. An example replaces a pstack example only where T3 tools change it, and links to the original. The adapter mirrors pstack's `docs/harness/claude-code.md`, so keep its sections, table shape, and voice: terse, declarative, one fact per sentence.
- Every adapter row names a T3 tool exactly as the tool calls itself (`delegate_task`, `watch_pull_request`, `schedule_task`, `link_pull_request`, `t3_thread_read`, `preview_*`, `device_*`), or says to skip with the line.
- `TERMS` in `scripts/generate.mjs` lists the Cursor names the generator looks for. Each `key` must appear verbatim in the first cell of an adapter table row, or in a heading. When pstack starts using a new Cursor feature, add its term and its row together.
- `docs/harness/t3-code/child.md` is the adapter for a delegated child. Every child reads it, so the generator holds it to 500 words. Put a row there only when a child that spawns nothing needs it. A row there never says more than the adapter's row.
- A part of the adapter that only one skill or one kind of step needs lives in its own file in `docs/harness/t3-code/`, such as `setup-pstack.md` and `waking.md`. The adapter keeps a heading or a row with the Cursor name and a link, because the term check reads only the adapter.
- After any change, run `node scripts/generate.mjs` and commit `skills/` with it. CI runs `node scripts/generate.mjs --check`.

## Updating pstack

Run `node scripts/generate.mjs --bump`. It pins pstack's `main` in `pstack.lock.json` and regenerates. A `FAIL` line names the term or link to fix. A `REVIEW` line is new skill text that names a tool, a field, or Cursor. The term list cannot see a new mechanic, such as a new kind of wake, a new subagent field, or a tracker, so read every `REVIEW` line and the upstream diff, and add a row and a term before you commit.
