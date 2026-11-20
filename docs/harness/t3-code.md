# pstack in T3 Code

pstack skills use Cursor names. In T3 Code, read this file once per session, then map each Cursor name in a skill with the tables below. Read it again whenever these tables are not in your context, such as after a compaction. `<skills>` is the folder that holds `poteto-mode/` and this file's folder, usually `~/.agents/skills/`, or `~/.claude/skills/` in a Claude thread. If a Cursor field has no row, drop it and say so. Never pass a field or value the tool schema rejects.

These rows hold in every T3 thread, whichever provider runs it, except where a row names a provider. A session may list a T3 tool with a prefix, such as `mcp__t3-code__delegate_task`, or defer it until you load it with the session's tool search. It is the same tool.

Read the steps in this tree's pstack guide and README, which describe Cursor and Claude Code, through this file too.

## T3 Code's own rules

T3 Code gives every thread its own rules for subagents, pull requests, browser previews, and waiting. Each row here maps a pstack step onto those rules, so a thread that follows the row follows both. A T3 Code rule decides how a step runs. It is not a reason to drop the step. When T3 Code forbids the only way to run a step, skip the step with the line under Cursor-only features.

By T3 Code's default, an ordinary coding task needs no T3 tools. A task the operator starts with `/poteto-mode` is not ordinary. A playbook step that delegates, proves, or reviews still runs when the change looks small. So `/no-comments` spawns Comment Sicko on every diff, even one with no comments, because it also judges workaround code.

Two choices belong to the operator, as lines that `/setup-pstack` writes in `~/.agents/pstack-models.md`. `# browser proof` lets a poteto-mode task use the browser unasked. `# when a model cannot run` says to ask, switch models, or stop. A row never makes either choice. With no line, T3 Code's own rule holds.

## Start of a run

These rows apply in a thread where `/poteto-mode` ran and the operator has not ended it. A thread that runs another pstack skill on its own skips them.

T3 Code may show the text you write before a tool call as one line. So the operator cannot rely on an opening or a todolist that you write there. `send_to_user` shows a message in full while the run goes on.

| pstack | T3 Code |
| --- | --- |
| Your first message on a task | One `send_to_user` call. Match the playbook, then read its file and `~/.agents/pstack-models.md` in full. Send the message before your first edit or spawn. It gives what the skill asks for: the goal, the problem, and the smallest change you expect. Then it gives the playbook's name and its steps as a checklist with one line per step. `send_to_user` takes 4,000 characters, so cut each step to its first sentence and keep any Mandatory mark. A step that delegates names its role's model, from that file or the skill's default. Send it and keep working. Do not wait for an answer, and do not repeat it in your final reply. A fully specified one-line edit needs no opening. Neither does a wake, a question you answer from what this thread already holds, or a correction inside the task you are on. The operator's PR-status request, failing checks included, is a Babysit task with its own opening. In a session with no `send_to_user`, put the opening at the top of your first reply. |
| Open a todolist | The session's todo or plan tool when it has one, with the playbook's steps copied in whole. Otherwise the checklist in the opening is the todolist. Send it again only when a step is skipped, added, or blocked. The final reply says how each step ended, as done or as `skip: <reason>`. A step the playbook marks Mandatory never ends as a skip. |
| The chat that receives `/poteto-mode` | T3 Code has no mode toggle, so the operator types `$poteto-mode` or `/poteto-mode`. The mode then holds for the rest of the thread. A later message that names no skill is a new poteto-mode task. It gets its own playbook, and its own opening unless the first row says it needs none. The mode ends when the operator writes `drop poteto-mode`. |
| A compaction | A summary keeps none of the skill text. Before you reply or use any other tool, read again, in full, `<skills>/poteto-mode/SKILL.md`, this file, and the playbook you are in. When you write a compaction summary, put those three paths in it and say that poteto-mode is on. |

## Tools

| Cursor | T3 Code |
| --- | --- |
| `Task`, a step that delegates to or spawns a subagent, its fields, and every model slug | `delegate_task`, never the provider's own subagent tool, such as `Agent` or `spawn_agent`. pstack runs every subagent in the background on its role's model, which T3 Code's rule sends to `delegate_task`. Read [Spawning subagents in T3 Code](t3-code/spawning.md) before the first spawn and before you pick a model. It maps `subagent_type`, `readonly`, `environment`, `run_in_background`, `resume`, each model slug, and the role lines of `~/.agents/pstack-models.md`. |
| `AskQuestion` | The session's own question tool, such as `AskUserQuestion`, when it has one and the choice fits its option limit. Otherwise ask in plain text and end the turn. When the question refers to a draft or a list, show that with `send_to_user` first. A skill that must ask, such as `setup-pstack`, runs in the operator's thread, never in a child. |
| Run another pstack skill (`/name` or "the **name** skill") | Read `<skills>/<name>/SKILL.md` and follow it. A skill or playbook this thread did not read did not run, so report it as `skip: <reason>`. The session's skill tool refuses most pstack skills, so do not call it for one. When you tell the user to type it, write `$<name>`. |
| `/deslop` from `cursor-team-kit` | This tree ships it at `<skills>/deslop/SKILL.md`. Run it before each commit, as any pstack skill. |
| `Read`, `Grep`, `Glob` | The session's file and search tools, or `cat` and `rg` in the shell. |
| `/visualize`, a chart or a diagram shown inline | `html_preview`, then `html_render`, as T3 Code's own rules say. |
| A `.cursor/` path, an agent or Project store, a tracker, a transcript, a `pstack/skills/` path, a `cursor/plugins` URL | Read [Paths in T3 Code](t3-code/paths.md) before you use it. Never edit a file under `<skills>`, because the next install rewrites it. |

## Pull requests

| Cursor | T3 Code |
| --- | --- |
| A built-in PR tool | Before a task's first PR, read [Opening a PR](../../skills/poteto-mode/playbooks/opening-a-pr.md) in full, because it names the passes that run first. Then use the forge command that the step gives, such as `gh pr create`. As your next call, link every PR you open, take over, or push to, each layer of a stack included. Use `link_pull_request`, or `link_pull_requests` for several. If linking fails, say so. |
| PR and CI event subscriptions, a wait on a PR | `watch_pull_request`, from the top-level thread only. Handle the comments already there, push what the branch needs, arm the watch, and end the turn. Such a wait is Babysit's, or work you were asked to do that waits on checks or reviews. Opening a PR is not one. The watch stays armed after each wake, so never arm it again on a wake. It never wakes on a merge, so a wait on another thread's merge is a handback. A wake is not a merge decision, so read the PR's state yourself. Call `unwatch_pull_request` before you hand work back. |
| `scripts/watch-pr/watch-pr` | Run it only with `--status-only`, which prints the PR's state once. The bare command polls until a verdict, and T3 Code allows no polling wait on a PR. |
| A child that owns a PR | It links the PR and never watches it. After any PR work, its last line is `PR <full URL>, head <SHA>, checks and reviews <state>`. When it must wait, it returns. Each parent passes that line up until the top-level thread watches the PR. On a wake, the top-level thread fixes a small finding itself. It hands a larger one to a fresh child for that PR, with the owner's consolidated brief. |

## Waking and scheduling

| Cursor | T3 Code |
| --- | --- |
| `/loop`, `/loop 1h`, Cursor Automations, `SendToUser`, a routine, a heartbeat, Pause safely, Session pickup | Read [Waking and scheduling in T3 Code](t3-code/waking.md) before you map it. Never poll in a loop instead. |

## setup-pstack

Run it in the operator's thread, not as a child, because it asks questions. Read [setup-pstack in T3 Code](t3-code/setup-pstack.md) before you follow the skill.

## make-bot-ui

Read [make-bot-ui in T3 Code](t3-code/make-bot-ui.md) before you follow the skill.

## Cursor-only features

When a step needs a feature with no row, put one line in your reply, `Skipped in T3 Code: <step>. <reason>.`, then go on to the next step. Do not stop, ask, or retry. When a later step needs what the skipped step made, such as a URL or a key, leave a placeholder and name it in the line.

| Cursor | T3 Code |
| --- | --- |
| Bugbot | Bugbot comments on a GitHub PR are ordinary review threads, so triage them with the forge command that the step gives. Skip a step that starts, waits for, or configures Bugbot when the PR has no Bugbot check or comment. |
| Cursor cloud agent, cloud VM, its status in the Cursor dashboard | A `delegate_task` with `isolation: "worktree"`, as [Spawning subagents in T3 Code](t3-code/spawning.md) says. Skip a step that needs the cloud machine itself. |
| `control-ui`, `control-cli` from `cursor-team-kit`, `create-verification-skill` | Read [Proof in T3 Code](t3-code/proof.md) before you drive a browser, a simulator, or a terminal as proof, and before you write a verification skill's driving steps. |
| Other `cursor-team-kit` skills | Follow `<skills>/<name>/SKILL.md` when it exists. Otherwise skip with the line. The line never skips a pstack skill, such as `/no-comments`, `/unslop`, or `/technical-writing`. |
| `create-skill` (Cursor's built-in for authoring SKILL.md files) | The session's own skill-authoring skill when it has one. Otherwise follow the step's own rules and pstack's Authoring a skill playbook alone. |
| Custom Modes, Option+Enter, the Agents Window, Plan Mode | Start of a run says how the mode holds. T3's plan interaction mode can stand in for Plan Mode. |
| Cursor's built-in babysit skill, or any other Cursor built-in a step warns you away from | Nothing to avoid. Follow the pstack step. |

## Any other Cursor name

Map a Cursor name with no row to its T3 meaning when one is plain. A Cursor restart is a T3 Code restart: running children stop, while scheduled tasks, linked PRs, and pushed branches survive. "The Cursor environment's MCPs" are the MCP tools this session lists. Otherwise skip with the line.
