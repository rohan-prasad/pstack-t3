# Waking and scheduling in T3 Code

Read this before a step waits on an event, loops, schedules a run, or builds an automation. The names map as in [the T3 Code adapter](../t3-code.md).

| Cursor | T3 Code |
| --- | --- |
| `/loop` (Cursor's built-in wake mechanism) | Pick the T3 wake for what you wait on. A PR event (checks finish or fail, a new comment or review, a conflict) is `watch_pull_request`. Handle the existing comments, arm it, and end the turn. Another event is an async `delegate_task` watcher, a small script that blocks until the event, whose completion wakes you. A heartbeat is `schedule_task` with `{"type":"interval","everyMs":<ms>}` and the tick prompt, bound to this thread. `/loop until X` puts the predicate in the tick prompt, and the tick that sees it met calls `delete_scheduled_task`. |
| `/loop 1h` | `schedule_task` with `{"type":"interval","everyMs":3600000}`. Keep the literal text `/loop 1h` where a plan or status message names it, because `poteto-mode/scripts/check-plan.mjs` checks for it, and record the scheduled task's id beside it. |
| Cursor Automations: routines, `update_state` routine calls, `api2.cursor.sh/automations` webhooks, routine wakes | `schedule_task`. A timed routine is `{"type":"interval",...}` or `{"type":"fixed_time","timeOfDay":"09:00","weekdays":[1,2,3,4,5]}`. A webhook routine is `{"type":"webhook"}`, and the result's `webhookUrl` is its URL. If `webhookUrl` is absent, tell the user to enable T3 Connect remote access. The run sees the request only through `{{body.<field>}}`, `{{headers.<name>}}`, `{{body}}`, or `{{request}}` placeholders in the prompt, so put them there. Set `bindToCurrentThread: false` only when the user wants a fresh thread per run. |
| `SendToUser` secret requests, sender keys | `request_secret`. You never see the value, and its `secretRef` works once, as a webhook `signature.secretRef` for a sender that signs with HMAC-SHA256, such as GitHub. It cannot give a server you build a copy of the secret. |

Every schedule you create is program state. Record its id in the decision trail or status file. On a hold, a stand-down, or Pause safely, set `enabled: false` with `update_scheduled_task` before you send any stop order, and say so. A tick prompt that can dispatch work starts by reading the hold state and does nothing while it is held. Delete the schedule when the program ends.
