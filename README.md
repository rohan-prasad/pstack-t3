# p3-stack

p3-stack is [pstack](https://github.com/cursor/plugins/tree/main/pstack) for T3 Code. Same engineering discipline, native T3 orchestration.

pstack is poteto's answer to AI slop code. It turns an agent into an engineering team: one mode skill that routes to playbooks, principles that ground every decision, and verification strict enough that you can parallelize with confidence.

p3-stack ships pstack's skills unchanged, plus one adapter, [`docs/harness/t3-code.md`](docs/harness/t3-code.md), that maps every Cursor name in them to T3 Code's tools. It also ships `deslop`, the one skill from Cursor's `cursor-team-kit` plugin that pstack runs before every commit. This is the same shape pstack uses for Claude Code. Following pstack is a version bump, not a rewrite.

This repo, [rohan-prasad/pstack-t3](https://github.com/rohan-prasad/pstack-t3), is a fork of [rasmushjulskov/p3-stack](https://github.com/rasmushjulskov/p3-stack). [What this fork changes](#what-this-fork-changes) lists the differences.

- **Delegation.** `delegate_task` replaces Cursor's Task tool, with per-role providers and models resolved from `orchestrator_capabilities`. Every poteto-mode subagent goes through it, as every one goes through Task in Cursor. Cross-model panels are native.
- **Worktrees.** `isolation: "worktree"` gives every worker, verifier, and PR owner its own checkout, and each still reports back to its parent.
- **Watching.** `watch_pull_request` wakes the thread when checks finish, someone comments, or the branch conflicts. No polling loops.
- **Scheduling.** `schedule_task` replaces `/loop` heartbeats and Cursor Automations, webhooks included.
- **Memory.** `t3_thread_search` and `t3_thread_read` replace mining Cursor transcript files.
- **Proof.** `preview_*` browser tools and `device_*` simulators replace `control-ui`. Screenshots and recordings land in the thread.

## Install

```bash
git clone https://github.com/rohan-prasad/pstack-t3.git
cd pstack-t3
./install.sh
```

T3 Code lists the skills each provider finds in its own folder. So `install.sh` links every `skills/*` directory into `~/.agents/skills/`, which Codex and Pi read, and into `~/.claude/skills/`, which Claude Code reads. It skips the Claude folder when `~/.claude` does not exist, and honors `CLAUDE_CONFIG_DIR`. Use `./install.sh --project /path/to/repo` to install into a project's `.agents/skills/` and `.claude/skills/` instead. Re-run it after you pull. It also removes links to skills that no longer exist.

After an install, restart the agent session in T3 Code or start a new thread. The skills then show under `$` in the composer, and under `/` unless you turned that off.

pstack has plain skill names such as `how`, `why`, and `tdd`. When a link with one of those names already points somewhere else, `install.sh` leaves it and says so. Pass `--force` to replace it, which you need once when you move from another p3-stack checkout to this one.

`./install.sh --hooks` also adds two hooks to Claude Code's settings. One brings poteto-mode back after a compaction, as [After a compaction](#after-a-compaction) explains. The other keeps a poteto-mode thread's subagents on `delegate_task`, as [Subagents](#subagents) explains. `./install.sh --remove-hooks` takes both out. A machine that ran `--hooks` before gets the second hook when it runs `--hooks` again.

## Get started

1. Run `/setup-pstack`. It reads `orchestrator_capabilities` and writes `~/.agents/pstack-models.md`, mapping each role (code, judgment, the review panels) to a provider and model you have.
2. Use `/poteto-mode` whenever you want rigorous work. It reads the request, picks a playbook, and runs the other skills as the steps need them. Type it once per thread. The mode holds until you write `drop poteto-mode`.
3. Stuck or unsure which skill fits? Ask `/poteto-help`. The [pstack guide](skills/pstack-t3/guide/README.md) walks through a first real task.

The commands keep pstack's names. Earlier versions of p3-stack renamed them (`/p3-mode`, `/setup-p3`, `/p3-help`). Those names are gone, and `install.sh` removes their links.

## Providers

Run `/poteto-mode` in a thread on any provider. Subagents go through T3's `delegate_task`, so one run can mix providers.

- A Claude model runs on the Claude Code provider and a GPT model on the Codex provider, even when Pi or OpenCode lists the same model.
- A model from any other maker runs on a multi-model provider such as Pi or OpenCode. pstack's default code model is Grok, and a Grok model on Pi counts.
- A provider that fails with a usage, billing, or sign-in error is dropped for the rest of the session.
- T3 Code tells a thread not to switch models unasked. So when a role's model cannot run, as when its provider is out of credit, pstack says so and leaves that role unrun. `/setup-pstack` offers two other choices. With `ask`, the thread asks you which model takes over. With `switch`, it picks one itself and says so.
- Under `switch`, a role moves to the same model on another provider, or to another model of the same maker. Failing that, it moves to a model of a family other than the judgment model's. That is the one your file names for another role, or else the strongest one listed, and never a small one. pstack's Grok default moves the same way on a machine with no Grok.

`/setup-pstack` writes these choices to `~/.agents/pstack-models.md`. Run it again after you add or remove a provider or a model.

## What a run looks like

A poteto-mode task opens with a message that names your goal, the playbook it matched, and that playbook's steps. T3 Code may show text written before a tool call as one line, so the adapter sends this opening through `send_to_user`. A one-line edit, a question the thread can already answer, and a correction inside a task get no opening. For any other task, no opening means the thread is not following the skill.

The mode holds for the whole thread, so a later message is a poteto-mode task too.

To measure it, run `node scripts/adherence.mjs`. It reads the Claude transcripts on this machine. For each task it prints whether the thread read the whole adapter and a whole playbook, whether it sent the opening, and how it spawned. A file counts as read only when a tool call read it. Tasks that start with the command are reported apart from later ones. `--since 2026-11-20` limits it to that date on. It prints dates and counts, never prompt text.

## After a compaction

A long thread fills its context, and the provider then replaces the history with a summary. The summary does not carry the skill text, so the thread goes on without poteto-mode's rules. In the Claude transcripts on one machine, a thread read the skill text again after 1 of 9 compactions.

The adapter tells a thread to read the skill again. That instruction is part of the text that gets dropped, so on its own it is a request. `./install.sh --hooks` makes the reminder certain for Claude threads. Claude Code runs the hook after each compaction and shows its output to the model. The hook prints the paths of the skill, the adapter, and the playbooks the thread read. The thread still has to read them. The hook prints nothing unless poteto-mode is on in the thread, or the thread is a pstack delegate, which it knows by the child adapter's path in the brief.

The hook needs Node. It goes in `~/.claude/settings.json`, so it covers every Claude session on the machine, in T3 Code and outside it. Codex, Grok, and Pi threads have no such hook and rely on the adapter's instruction.

## Subagents

pstack runs every subagent in the background, on the model its role names in `~/.agents/pstack-models.md`. In T3 Code that is a `delegate_task` child. T3 Code also tells a Claude thread to use Claude Code's own `Agent` tool for a foreground child on its own model. In 4 of 9 poteto-mode threads audited on 20 Nov 2026, the Feature playbook's code-writing step took that path. The code then ran on the parent's model, in the foreground, with no pstack brief. Those four threads never read the spawning part or the model file. The three that read both spawned correctly.

The adapter now maps a step that delegates in plain words, as Feature's does, to `delegate_task`, and the opening names each delegating step's model. `./install.sh --hooks` adds a second hook that makes this certain for Claude threads. Claude Code runs it before its own subagent tool. It acts only in a session that T3 Code started, because outside T3 Code that tool is how pstack spawns. In a poteto-mode thread or a pstack delegate there, it refuses the call and names `delegate_task`, the spawning part, and the model file. It lets the call through while you run a skill from outside pstack, and for the `web-fetch` helper that stands in for a missing WebFetch tool. Elsewhere it does nothing, so T3 Code's own rule holds outside the mode. Only your own message turns the mode on or off, so a PR wake or a summary that quotes `drop poteto-mode` does not. Codex, Grok, and Pi threads have no such hook and rely on the adapter.

## T3 Code's own rules

T3 Code gives every thread rules for subagents, pull requests, browser previews, and waiting. The adapter maps each pstack step onto those rules instead of around them. A child's completion wakes its parent, so nothing polls. A PR wait is `watch_pull_request`. Browser proof runs in the thread's own background tab and closes it. A child never spawns unless its brief says it may.

Two choices are yours, and `/setup-pstack` asks for both. It writes them to `~/.agents/pstack-models.md`.

- `# browser proof: on` is your standing request for browser work in every poteto-mode task that changes or debugs a screen. T3 Code allows browser work only when you ask for it. With `off` or no line, a thread uses the browser only when your message asks, and otherwise reports the screen as not proven.
- `# when a model cannot run: ask` has the thread ask you which model takes over, as when a provider runs out of credit. It offers up to three models that can run now, starting with the ones your file names for other roles, and the choice to leave the role unrun. You can name any other model in your answer. The answer holds for that model for the rest of the session, and that role waits until you answer. `switch` lets pstack pick the model itself and say so. With `stop` or no line, the thread says so and leaves that role unrun.

Browser proof needs T3's browser. A Linux host that blocks Chrome's sandbox, such as Ubuntu 23.10 or later, stops it from starting. T3 Code then names a one-time `t3 browser setup` command to run with `sudo`. A thread asks for the password through T3 Code's own prompt, and reports the screen as not proven if you decline.

pstack stays out of threads that did not ask for it. Claude Code and Cursor keep a skill marked `disable-model-invocation` out of the model's context. Codex ignores that flag, so the generator writes an `agents/openai.yaml` beside each such skill. A Codex thread then lists one pstack skill, `setup-pstack`, in place of 60, and `$poteto-mode` still runs. In a Codex thread, type the command with `$`. Codex loads a skill from `$name` alone, and it can no longer find one of these skills in its list.

## Token cost

A thread reads the adapter before its playbook, so the adapter stays short. It holds about 1,890 words, down from 2,900. The rows that one kind of step needs are separate files that a thread reads only when it gets there: [spawning and models](docs/harness/t3-code/spawning.md), [proof](docs/harness/t3-code/proof.md), [paths](docs/harness/t3-code/paths.md), [waking and scheduling](docs/harness/t3-code/waking.md), `setup-pstack`, and `make-bot-ui`. A task that spawns reads the spawning part too, about 2,250 words, so it reads more than before. A task that does not spawn reads less.

A delegated child reads [`child.md`](docs/harness/t3-code/child.md), under 500 words, in place of the adapter. The generator fails when the installed adapter, frontmatter included, passes 1,900 words, or `child.md` passes 500.

## How it works

```
pstack.lock.json          the pstack commit this repo builds from
t3-tools.json             T3 Code's tool names, listed from a live thread
docs/harness/t3-code.md   the T3 adapter, the only hand-written skill text
docs/harness/t3-code/     the child adapter, the adapter's read-on-demand parts, and T3 versions of pstack examples
scripts/generate.mjs      builds skills/ from those
scripts/adherence.mjs     measures how far real tasks followed the skill
scripts/pstack-compaction-hook.mjs   the Claude Code hooks that `install.sh --hooks` registers
scripts/transcript.mjs    how those two read a Claude transcript, with tests beside it
skills/                   generated, committed so install needs no build step
```

`scripts/generate.mjs` fetches pstack at the pinned commit and copies its skills, agent briefs, guide, and README into `skills/`. It also copies `deslop` from `cursor-team-kit`, which sits beside pstack in the same repository, with that plugin's license. It adds `disable-model-invocation: true`, as pstack has on its own skills, and changes nothing else. Every skill that uses a Cursor name gets one line under its heading pointing at the adapter, which lands at `skills/pstack-t3/SKILL.md`. The files in `docs/harness/t3-code/` land beside it in `skills/pstack-t3/`. Links between pstack files are rewritten to work in the installed tree, and links to files the tree leaves out point at the pinned commit on GitHub.

The generator fails when a skill uses a Cursor name the adapter has no row for, when a skill's name differs from its folder, or when a link breaks. So a new pstack feature cannot slip through unmapped.

It also fails when the adapter names a T3 tool that `t3-tools.json` does not list. T3 Code renames and merges tools between releases. Refresh the list from a T3 thread, and each stale name in the adapter becomes a `FAIL` line.

## Update pstack

```bash
node scripts/generate.mjs --bump    # pin pstack main, regenerate skills/
node scripts/generate.mjs --check   # what CI runs
```

If `--bump` reports a missing row, add it to `docs/harness/t3-code.md` and run it again.

The term list only finds Cursor names it already knows. So `--bump` also prints a `REVIEW` line for every new line of skill text that names a tool, a field, or Cursor, and writes the list to `.cache/bump-review.md`. Read each one and add a row and a term where T3 Code differs.

A weekly workflow opens the bump as a PR with that list in its body, and opens an issue when the bump fails. On a fork, enable Actions first, and allow Actions to create pull requests under Settings, Actions, General.

## What this fork changes

- Follows pstack 0.15.36, with rows for its rewritten Orchestrate playbook: the Project tracker, the Project store, PR and CI event subscriptions, and forking a worker.
- Adds the child adapter and the read-on-demand parts described under [Token cost](#token-cost).
- Routes by model family across providers, as described under [Providers](#providers).
- `--bump` lists new upstream text for review, and the sync workflow reports a failed bump.
- `install.sh` no longer replaces a link that belongs to another skill pack, and it also links the skills where Claude Code reads them. The original linked only `~/.agents/skills/`, which Claude threads do not read.
- A run opens with a visible message, and the mode holds for the thread, as described under [What a run looks like](#what-a-run-looks-like).
- An optional Claude Code hook brings the skill text back after a compaction, as described under [After a compaction](#after-a-compaction).
- Ships `deslop` from `cursor-team-kit` at the pinned commit. pstack runs it before every commit, and without it every PR skipped that pass.
- Sends every poteto-mode subagent to `delegate_task` on its role's model, and an optional Claude Code hook refuses Claude's own subagent tool in the mode, as described under [Subagents](#subagents).
- Keeps a playbook's Mandatory mark in the opening, sends PR-status requests to the Babysit playbook, and has a thread read Opening a PR before its first PR.
- Every row follows T3 Code's own rules, and pstack no longer loads into Codex threads that did not ask for it, as described under [T3 Code's own rules](#t3-codes-own-rules).
- The generator checks every T3 tool name against `t3-tools.json`. That check found eight names T3 Code had since renamed or merged.

## Credits

p3-stack adapts [pstack](https://github.com/cursor/plugins/tree/main/pstack) by [poteto](https://x.com/poteto). The skills, principles, and language are hers. The T3 Code adapter and its generator come from [uzairansaruzi/p3-stack](https://github.com/uzairansaruzi/p3-stack) and [rasmushjulskov/p3-stack](https://github.com/rasmushjulskov/p3-stack), which this repo forks. MIT, see [LICENSE](LICENSE).
