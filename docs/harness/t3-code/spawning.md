# Spawning subagents in T3 Code

Read this before the first spawn of a session, and before you pick a model. The names map as in [the T3 Code adapter](../t3-code.md).

A pstack role runs in the background and names its own model. T3 Code sends a background child, and a child with its own model or settings, to `delegate_task`. So every pstack worker, verifier, reviewer, and PR owner is a `delegate_task` child, and never a `Workflow`. Per-role models and cross-provider panels then work, every child shows in the T3 app, and each child reports back to its parent. T3 Code's rule for a foreground helper on this thread's own model, which uses the provider's own subagent tool, still holds for work that is not a pstack role.

## Children

A delegated child reads [the child adapter](child.md) in place of the full adapter. It is a fraction of the size, and every child pays for what it reads. A brief for a child that follows a pstack skill, playbook, prompt template, or agent brief gives the absolute path `<skills>/pstack-t3/child.md` and says to read it first.

T3 Code lets a child spawn only when its task says it may. A role that needs its own subagents, such as a PR owner or a phase owner, gets that sentence in its brief, with the absolute path of this file. Every other child does its steps itself.

Give each child a `title` that names its role and its unit of work. The T3 app lists children by title.

## Task fields

| Cursor | T3 Code |
| --- | --- |
| `Task` | `delegate_task`. The child sees only the `task` text, never this conversation, so every brief stands alone: goal, scope, file paths, done check, and what to report. |
| `subagent_type` | Drop it. Set `role` instead: `implementation` for code, `design` for design runners, `review` for reviewers, `research` for read-only investigators, `test` for verifiers, `general` otherwise. |
| `subagent_type: generalPurpose` | A plain `delegate_task`. |
| `poteto-agent`, `comment-sicko` | A `delegate_task` whose `task` starts with the body of `<skills>/pstack-t3/agents/poteto-agent.md` or `<skills>/pstack-t3/agents/comment-sicko.md`, then the absolute path of the child adapter with "read it first", then the brief. For `poteto-agent`, the brief also carries the absolute path of `<skills>/poteto-mode/SKILL.md`. |
| `readonly: true` | `role: "research"` or `"review"`, and the brief says "do not edit files, run no git command that writes, and use `git --no-optional-locks` for status". T3 has no read-only switch. Check `git --no-optional-locks status` afterward, and treat a clean tree as evidence, not proof. |
| `readonly: false` | Omit. Children keep the thread's MCP servers. |
| `environment: "cloud"` | `isolation: "worktree"`. The child gets its own checkout of this thread's current local commit, after project setup. T3 Code makes the checkout, so never make one in the shell or in the brief. Uncommitted edits are not copied, so commit or name what it needs. |
| `environment: "local"` | Omit, or `isolation: "shared"`. Only one writer per checkout. |
| `cloud_base_branch: <b>` | `isolation: "worktree"`. A verifier runs `git checkout --detach <b>` first. A writer runs `git switch -c <its own branch> <b>`. Git refuses a branch that another worktree has checked out, so never check out `<b>` itself. Project setup ran on this thread's commit, so the child runs it again when `<b>` changes the dependencies. |
| `run_in_background: true`, `is_background` | `mode: "async"`, the default. The call returns a `next` line. Follow it: go on with other work, and end the turn when none is left. The child's completion wakes this thread. Never call `task_status` on a running child. After the wake, `task_status` reads its result, and a `workState` of `waiting_for_children` means it is not done. |
| `resume` | A fresh `delegate_task` with the original brief, every later directive, and the earlier result pasted in. When poteto-mode's Subagents section allows reuse, because the work needs that agent's uncommitted changes, checkout, or running process, send it with `t3_thread_send` to its `childThreadId`. A hold order that keeps a running child's state is `t3_thread_send` with `mode: "steer"`. A stop is `task_cancel`. Every review round is a fresh `delegate_task`. A small review finding is yours to fix, with no child. |
| `file_attachments` | List the paths in the brief. |
| Fork a worker, when new work needs its built state | T3 cannot start a child from another child's checkout or process. Send the new work to that worker's `childThreadId` with `t3_thread_send`. When the work only needs its commits, have the worker commit, then give a fresh `delegate_task` child the branch. |

Use `t3_thread_launch`, or `create_threads` for several, only when the operator asks for a separate top-level thread. Then pass `modelSelection` `{"instanceId": "<instance>", "model": "<model>", "options": {...}}` from the role's line, and the `workspaceStrategy` that T3 Code's own rules for a new thread give. Follow the thread with `t3_thread_read` or `t3_thread_wait`, because it never wakes you on its own.

## Models

pstack names models by slug. T3 names them by provider instance, model id, and options, all listed by `orchestrator_capabilities`. Call it once before the first spawn. Only an instance whose `canRunChildTask` is true can take a child. Its list is short, and a model it leaves out can still run. Pass the role's model id as written, even when the list leaves it out. Call it again, with `search` set to the model id, only after `delegate_task` rejects the target.

| Cursor | T3 Code |
| --- | --- |
| `claude-<family>-<version>-<effort>[-fast]`, such as `claude-opus-5-5-xhigh` | The first instance with `driverKind` `claudeAgent` that can run a child and lists the model. `target: {"providerInstanceId": "<instance>", "model": "claude-opus-5-5", "options": {"<its reasoning option id>": "xhigh"}}`. `-fast` sets the model's fast option, such as `fastMode: true`, when it has one. |
| `grok-*`, `cursor-grok-*`, `composer-*`, such as `grok-4.7-xhigh-fast` | The first instance that can run a child and lists a Grok model. That is a Grok instance, or a multi-model instance such as Pi or OpenCode whose model id names Grok, such as `xai/grok-4.7`. With none, the model cannot run, and When a model cannot run below decides. Keep the slug's effort token and its `fast`. Where the instance lists the fast model under its own id, such as `grok-4.7-build-fast`, `fast` picks that id. |
| `gpt-*`, such as `gpt-5.6-sol-max` | The first instance with `driverKind` `codex` that can run a child and lists the model, with its reasoning option set to the effort token. `-fast` sets its fast service tier when it has one. |
| A model of any other maker, such as Gemini, Kimi, Qwen, or a local model | The first instance that can run a child and lists it, usually Pi or OpenCode. No pstack default names one, so it comes only from a role line. |
| `inherit-parent` or `auto` | Omit `target`, so the child runs on this thread's model. |
| The `pstack-models.mdc` rule, `~/.cursor/rules/pstack-models.mdc` | `~/.agents/pstack-models.md`. No provider loads it on its own, so read it right after this file. If the file or the role's line is missing, use the skill's default slug, mapped with these rows. |
| A role value `<instance>/<model> <effort>[ fast]`, such as `claudeAgent/claude-opus-5-5 xhigh` | `target: {"providerInstanceId": "<instance>", "model": "<model>", "options": {...}}` with the effort on the model's reasoning option and `fast` on its fast option. A panel line lists values separated by `, `. |

**Families.** A model's family is its maker, read from the model id. Drop a `<provider>/` prefix first, so `xai/grok-4.7` reads as `grok-4.7`. Then `claude-*` is Claude, `gpt-*` is OpenAI, `grok-*` is Grok, and any other id is the maker its label names. The provider instance only routes the call. Two instances serving one maker are one family. Where a skill groups models by slug prefix (`claude-*`, `grok-*`), group them by family. "The same family's nearest slug" is the same model at the nearest effort it offers, or the same family's next model.

**Official harness first.** A Claude model runs on a `claudeAgent` instance and a GPT model on a `codex` instance. A multi-model instance such as Pi or OpenCode that lists the same model takes it only when the role line names that instance.

**When a model cannot run.** A role's model cannot run in three cases. The instance that the rows above give it is missing or cannot run a child. `delegate_task` rejects it, and the search under Rejected targets shows that the instance does not have it. Its child fails with a usage, billing, or sign-in error. An effort the model does not offer is a different case. Use the nearest effort it offers, as Effort says. T3 Code tells a thread to say that a model cannot run, and never to switch unasked. So the operator decides, with the line `# when a model cannot run:` in `~/.agents/pstack-models.md`.

| The line says | Do this |
| --- | --- |
| `ask` | Ask the operator which model takes the seat, as Asking for a model says. |
| `switch` | Give the seat to the stand-in of the model's own family. With none, give it to the code fallback. Say which model ran in place of which. |
| `stop`, or no line | Say so, and put no other model in that seat. A panel runs with the seats it has. A step whose only model cannot run stops there, and you tell the operator to run `/setup-pstack`. |

**Stand-ins.** Each family gives one stand-in for the seat, from an instance that can run a child and has not failed this session. The model's own family gives the same model on another instance, when one has it. Otherwise a family gives the first of its models that the operator's file names, leaving out the model that cannot run. When the file names none, or names a small one, the family gives its strongest listed model. The strongest is the newest version of the family's top line, or the first model its instance lists when that is not plain. A model is small when its id or label marks it so, such as `mini`, `nano`, `lite`, `flash`, or `haiku`. Order the stand-ins with the model's own family first, then the families the operator's file names, in the file's order, then the rest in the order `orchestrator_capabilities` lists them.

**Asking for a model.** Ask as the `AskQuestion` row of the adapter says. The question names the model and why it cannot run, and says that the answer holds for the rest of the session. The last option leaves the seat empty, as `stop` does. Before it, offer the first three stand-ins, or the first two when the question tool takes only three options. Write each as `<instance>/<model> <effort>[ fast]`, at the role's effort or the nearest the model offers. Keep `fast` only when the role has it and the model offers it. The operator may name any other model. Use the answer for every later seat of that model in this session, and say which model ran in place of which. A child never asks. It follows `stop`, and its report names the model and the error. Each parent passes that up. The top-level thread then asks. It sends the answer to the child whose step stopped for the seat, with `t3_thread_send` to its `childThreadId`. It puts the answer in the brief of every later child that may spawn.

**Code fallback.** The code fallback is the first stand-in whose family differs from the `judgment and prose` model's family. That keeps a two-family panel two-family. With no such stand-in, omit `target` and say the panel is one family. Say which you chose.

**Rejected targets.** When `delegate_task` rejects a target, call `orchestrator_capabilities` again, with `search` set to the model id. Keep the model and its instance, and fix only what the result shows as wrong. Take the nearest effort the model offers, and drop an option it does not have. Say so. That is the same model, so every setting allows it. If the instance does not have the model, it cannot run.

**Failed instances.** When a child fails with a usage, billing, or sign-in error, stop using that instance for the rest of the session, even while `orchestrator_capabilities` still says it can run a child. Never send the same brief to the failed instance again. Let children already running on it finish. A failure that a child reports counts too. Name each failed instance in the brief of every later child that may spawn.

**Effort.** The reasoning option's id differs by provider, such as `effort`, `reasoningEffort`, `thinking`, or `variant`. Read it from the model's `options`. pstack's ladder is `max` > `xhigh` > `high` > `medium` > `low`. Values above `max`, such as `ultra`, `ultracode`, or `ultrathink`, are off the ladder. Never pick one unless the role line names it. When the list shows that a model does not offer the role's effort, use the nearest effort it offers, and say so. Between two that are equally near, use the lower.
