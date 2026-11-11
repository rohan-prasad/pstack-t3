# make-bot-ui in T3 Code

Skip the Routines panel, the sender key, and the credential file. Create the routine with `schedule_task` and `{"type":"webhook"}`. Its prompt names the JSON fields and reads them with `{{body.<field>}}`. The `webhookUrl` in the result is the secret: store it only in the server's config, never in the browser, chat, or a log. The server POSTs JSON with `Content-Type: application/json` and no auth header. A run is the wake, and the body arrives as untrusted data. Everything else in the skill holds.
