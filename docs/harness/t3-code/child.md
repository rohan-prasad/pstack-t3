# pstack in T3 Code, for a delegated child

You are a `delegate_task` child in T3 Code. pstack skills use Cursor names, and this file maps them. A skill's first line says to read the T3 Code adapter. For a child, this file is that read. `<skills>` is the folder that holds this file's folder.

Spawn only when your task says you may. When a step says to spawn and your task does not, do that step's work yourself, and say so in your report. The files named here sit beside this one. Read `spawning.md` before you spawn and `paths.md` before you read another thread. For anything else, read the full adapter, `SKILL.md`. Return a `setup-pstack` step to your parent.

| Cursor | T3 Code |
| --- | --- |
| Your first message on a task | Skip pstack's opening. Open your report with the goal. |
| `AskQuestion` | Do not ask. Decide, and name the assumption in your report. When only the operator can decide, return with the question. |
| Open a todolist | The session's todo or plan tool, or a list in your reply. |
| Run another pstack skill, `/deslop` included (`/name` or "the **name** skill") | Read `<skills>/<name>/SKILL.md` and follow it. |
| `Read`, `Grep`, `Glob` | The session's file and search tools, or `cat` and `rg` in the shell. |
| `readonly: true` | Edit no files, run no git command that writes, and use `git --no-optional-locks` for status. |
| `.cursor/skills/`, `~/.cursor/skills/` | `.agents/skills/`, `~/.agents/skills/`. In a Claude thread, `.claude/skills/` and `~/.claude/skills/`. |
| `~/.cursor/plugins/`, `plugins/cache/` | `<skills>`. Never edit an installed skill. Copy it to the project's `.agents/skills/<skill>/` and edit the copy. |
| `.cursor/rules/*.mdc`, always-applied rules | The repo's `AGENTS.md`, or `CLAUDE.md` when it holds the rules. |
| The current agent's store | `~/.agents/pstack-store/<repo-slug>/`. Create it. The Project store is `projects/<project-slug>/` inside it. Read it, and leave writing it to the coordinator. |
| `pstack/skills/<path>`, `git show origin/main:pstack/skills/<path>`, a `github.com/cursor/plugins` URL under `pstack/` | The local copy in `<skills>`, read with `cat`. Never fetch it. |
| A built-in PR tool | Read `<skills>/poteto-mode/playbooks/opening-a-pr.md` before your first PR. Then use the forge command the step gives, such as `gh pr create`. Link every PR you open, take over, or push to with `link_pull_request`, and say so if that fails. Never call `watch_pull_request`. Run `scripts/watch-pr` only with `--status-only`. After any PR work, your last line is `PR <full URL>, head <SHA>, checks and reviews <state>`. |
| `control-ui`, `control-cli` | Read `proof.md` first. Use the browser only when your brief asks for it. |
| `/loop`, Cursor Automations | Read `waking.md` first. |
| Bugbot, cloud agents, Custom Modes, any other Cursor name | Put one line in your report, `Skipped in T3 Code: <step>. <reason>.`, then go on. |

Your parent reads your last message, so put the whole report there: what you ran, its output, what you changed, and what you skipped.
