# p3-stack

p3-stack is [pstack](https://github.com/cursor/plugins/tree/main/pstack) for T3 Code. Same engineering discipline, native T3 orchestration.

pstack is poteto's answer to AI slop code. It turns an agent into an engineering team: one mode skill that routes to playbooks, principles that ground every decision, and verification strict enough that you can parallelize with confidence.

p3-stack ships pstack's skills unchanged, plus one adapter, [`docs/harness/t3-code.md`](docs/harness/t3-code.md), that maps every Cursor name in them to T3 Code's tools. This is the same shape pstack uses for Claude Code. Following pstack is a version bump, not a rewrite.

This repo, [rohan-prasad/pstack-t3](https://github.com/rohan-prasad/pstack-t3), is a fork of [rasmushjulskov/p3-stack](https://github.com/rasmushjulskov/p3-stack). [What this fork changes](#what-this-fork-changes) lists the differences.

- **Delegation.** `delegate_task` replaces Cursor's Task tool, with per-role providers and models resolved from `orchestrator_capabilities`. Cross-model panels are native.
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

## Get started

1. Run `/setup-pstack`. It reads `orchestrator_capabilities` and writes `~/.agents/pstack-models.md`, mapping each role (code, judgment, the review panels) to a provider and model you have.
2. Use `/poteto-mode` whenever you want rigorous work. It reads the request, picks a playbook, and runs the other skills as the steps need them.
3. Stuck or unsure which skill fits? Ask `/poteto-help`. The [pstack guide](skills/pstack-t3/guide/README.md) walks through a first real task.

The commands keep pstack's names. Earlier versions of p3-stack renamed them (`/p3-mode`, `/setup-p3`, `/p3-help`). Those names are gone, and `install.sh` removes their links.

## Providers

Run `/poteto-mode` in a thread on any provider. Subagents go through T3's `delegate_task`, so one run can mix providers.

- A Claude model runs on the Claude Code provider and a GPT model on the Codex provider, even when Pi or OpenCode lists the same model.
- A model from any other maker runs on a multi-model provider such as Pi or OpenCode. pstack's default code model is Grok, and a Grok model on Pi counts.
- With no Grok model, the code roles fall back to the strongest model of a family other than the judgment model's, never a small one.
- A provider that fails with a usage, billing, or sign-in error is dropped for the rest of the session.

`/setup-pstack` writes these choices to `~/.agents/pstack-models.md`. Run it again after you add or remove a provider or a model.

## Token cost

Every delegated child used to read the whole adapter, about 3,050 words. A child now reads [`child.md`](docs/harness/t3-code/child.md), about 430 words, and opens the full adapter only to spawn, schedule, or read other threads. The generator fails when `child.md` passes 500 words. The parts of the adapter that one skill needs, for `setup-pstack`, `make-bot-ui`, and waking and scheduling, are separate files that a thread reads only when it gets there.

## How it works

```
pstack.lock.json          the pstack commit this repo builds from
docs/harness/t3-code.md   the T3 adapter, the only hand-written skill text
docs/harness/t3-code/     the child adapter, the adapter's read-on-demand parts, and T3 versions of pstack examples
scripts/generate.mjs      builds skills/ from those
skills/                   generated, committed so install needs no build step
```

`scripts/generate.mjs` fetches pstack at the pinned commit and copies its skills, agent briefs, guide, and README into `skills/`. Every skill that uses a Cursor name gets one line under its heading pointing at the adapter, which lands at `skills/pstack-t3/SKILL.md`. The files in `docs/harness/t3-code/` land beside it in `skills/pstack-t3/`. Links between pstack files are rewritten to work in the installed tree, and links to files the tree leaves out point at the pinned commit on GitHub.

The generator fails when a skill uses a Cursor name the adapter has no row for, when a skill's name differs from its folder, or when a link breaks. So a new pstack feature cannot slip through unmapped.

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

## Credits

p3-stack adapts [pstack](https://github.com/cursor/plugins/tree/main/pstack) by [poteto](https://x.com/poteto). The skills, principles, and language are hers. The T3 Code adapter and its generator come from [uzairansaruzi/p3-stack](https://github.com/uzairansaruzi/p3-stack) and [rasmushjulskov/p3-stack](https://github.com/rasmushjulskov/p3-stack), which this repo forks. MIT, see [LICENSE](LICENSE).
