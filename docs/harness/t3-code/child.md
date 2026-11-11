# pstack in T3 Code, for a delegated child

You are a `delegate_task` child in T3 Code. pstack skills use Cursor names. Map them with this file. A skill's first line tells you to read the T3 Code adapter. For a child, this file is that read. `<skills>` means the folder that holds this file's folder.

Read the full adapter, `SKILL.md` beside this file, only before you do one of these: spawn a subagent, pick a model, schedule a wake, read another thread, or follow `setup-pstack` or `make-bot-ui`.

| Cursor | T3 Code |
| --- | --- |
| `AskQuestion` | You cannot reach the operator. Decide, and name the assumption in your report. When only the operator can decide, return with the question. |
| Open a todolist | The session's todo or plan tool, or a list in your reply. |
| Run another pstack skill (`/name` or "the **name** skill") | Read `<skills>/<name>/SKILL.md` and follow it. |
| `Read`, `Grep`, `Glob` | The session's file and search tools, or `cat` and `rg` in the shell. |
| `readonly: true` | Edit no files, run no git command that writes, and use `git --no-optional-locks` for status. |
| `.cursor/skills/`, `~/.cursor/skills/` | `.agents/skills/`, `~/.agents/skills/` |
| `~/.cursor/plugins/`, `plugins/cache/` | `<skills>`. Never edit an installed skill. Copy it to the project's `.agents/skills/<skill>/` and edit the copy. |
| `.cursor/rules/*.mdc`, always-applied rules | The repo's `AGENTS.md`, or `CLAUDE.md` when the repo keeps its rules there. |
| The current agent's store | `~/.agents/pstack-store/<repo-slug>/`. Create it. The Project store is `projects/<project-slug>/` inside it. Read it, and leave writing it to the coordinator. |
| `pstack/skills/<path>`, `git show origin/main:pstack/skills/<path>`, a `github.com/cursor/plugins` URL under `pstack/` | The local copy in `<skills>`, read with `cat`. Never fetch it. |
| A built-in PR tool | The forge command the step gives, such as `gh pr create`, then `link_pull_request`. A child cannot call `watch_pull_request`. Use the step's `scripts/watch-pr` for status. When you must wait, return with the PR URL and what you wait for. |
| `control-ui`, `control-cli` | Browser and web UIs: the `preview_*` tools. Simulators: the `device_*` tools. CLIs and TUIs: the shell, with the output as evidence. |
| `/loop`, Cursor Automations, transcripts | Read the full adapter first. |
| Bugbot, cloud agents, Custom Modes, any other Cursor name | Put one line in your report, `Skipped in T3 Code: <step>. <reason>.`, then go on to the next step. |

Your parent reads your last message. Put the whole report there: what you ran, its output, what you changed, and what you skipped.
