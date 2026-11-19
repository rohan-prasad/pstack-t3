# Proof in T3 Code

Read this before a step drives a browser, a simulator, or a terminal to reproduce a bug or prove a change. The names map as in [the T3 Code adapter](../t3-code.md).

| Cursor | T3 Code |
| --- | --- |
| `control-ui` from `cursor-team-kit`, for a browser or web UI | The `preview_*` tools, under the browser rule below. Call `preview_status` first. Then open your own tab with `preview_open`, `reuseExistingTab: false`, and `open: false`, and pass its `tabId` on every call. Drive it with `preview_navigate`, `preview_act` for a click, typed text, a key press, or a scroll, and `preview_wait_for`. Take the proof with `preview_snapshot`, and `preview_recording_start` / `preview_recording_stop` for video. `preview_resize` sets the screen size. Close the tab with `t3_preview_close` before you reply. Never act on a tab the operator drives. An Electron app with no preview path is a skip. |
| `control-ui`, for an iOS or Android simulator | `device_list`, then `device_open` with the `hostId` and `deviceId` it gives, then the `agent-device` command that `device_open` returns for every launch and tap. `device_screenshot` looks at the screen, and `device_close` ends the session. A brief for a child that does device work carries the `hostId` and the device id, and says to use `device_open`. |
| `control-cli`, for a CLI or a TUI | Drive it from the shell, and capture the output as evidence. |

## The browser rule

T3 Code allows browser work only when the request asks for it. The operator can ask once for every poteto-mode task, with the line `# browser proof: on` in `~/.agents/pstack-models.md`. With that line, a step that reproduces a bug, proves a change, or compares two screens runs in the browser. With `off` or no line, run such a step in the browser only when the operator's message asks for it or names the page. Otherwise prove what you can without the browser, and report the screen as not proven.

When two `preview_*` calls fail on one step, quote the error, and follow T3 Code's own rule for switching browsers.

On some Linux hosts T3's browser cannot start until a one-time setup command runs with `sudo`. The error names the command. Ask for the password with `request_secret` and `delivery: "file"`, run the command once, and try again. A child returns with the command in its report. If the operator declines, report the screen as not proven.

## create-verification-skill

For a browser surface with no harness of its own, write each feature's driving section with the `preview_*` tools. Follow [the T3 version of the create-note example](examples/create-note.md) in place of the skill's `control-notes browser` example. It shows one tab per run, role locators, waits, and which `preview_snapshot` call gives which proof. A simulator surface uses the `device_*` tools in the same shape. `maintain-verification-skill` keeps maps in this shape.
