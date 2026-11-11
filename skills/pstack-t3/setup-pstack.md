# setup-pstack in T3 Code

Follow the skill's steps with these changes. Map every slug with the Models section of [the T3 Code adapter](SKILL.md).

- Detect. The detected models are the models of every instance whose `canRunChildTask` is true, at each effort on the ladder that the model's reasoning option offers. A model with a fast option is also detected with ` fast`. Write a real model as `<instance>/<model> <effort>[ fast]`, such as `codex/gpt-6.1-sol xhigh`. The instance ends at the first `/`, because a model id on Pi or OpenCode has its own, such as `pi/xai/grok-4.7 high`. The effort is the last token, or the one before a trailing `fast`, so the budget step works as written.
- Official harness first. When two instances list the same model, offer the `claudeAgent` instance for a Claude model and the `codex` instance for a GPT model. Offer the other route only when the user asks for it.
- Load. If `~/.agents/pstack-models.md` is missing but `~/.cursor/rules/pstack-models.mdc` exists, read the Cursor file as the current state and map its slugs with the adapter's rows.
- Defaults. Map each default slug with the adapter's rows before the budget step applies. When a Grok default falls back, step 3c shows it with "replaces Grok, which is not available" and still offers the other detected models. Step 3b caps Grok at `xhigh`. A fallback model has no such cap, so `unlimited` takes it to `max`.
- Confirm. There are more detected models than `AskUserQuestion` takes, so ask for role changes in plain text, grouped by instance.
- Write. Write `~/.agents/pstack-models.md` with no frontmatter, then the comment lines, the `# budget` line, and one line per role from step 5. In the comment lines, write "omit `delegate_task` `target`" where the skill says "omit Task `model`". Overwrite the whole file. Never put the role lines in `AGENTS.md` or `CLAUDE.md`.
- Tell the user the file applies from the next pstack skill run in any T3 thread, because every pstack skill that spawns a subagent reads it after the adapter. Tell them to run `/setup-pstack` again after they add or remove a provider or model.
