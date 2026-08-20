---
'@crypte/cli': patch
---

Editing `crypte.config.ts` no longer asks for a restart.

`crypte dev` used to print `crypte.config.ts changed, restart \`crypte dev\``and do nothing more. It now rebuilds the whole server, which is what reading that file means: our configuration is read outside Vite, and the serve plugin captures the project, so the aliases, the CSS entry, the adapter and the user's own plugins all come from there.`server.restart()` of Vite reads Vite's configuration, not ours.

The new server is built before the old one closes, so a half-written configuration leaves the running server alone and says so, the same rule the catalogue's rebuild already follows. Closing last also hands the port over with nothing in between, so the browser reconnects on its own: the preview reloads, says it is ready, and the shell re-reads its catalogue at that moment.

A change is recognised by the content of the watched files rather than by the event, since one save fires several and an editor touches the date of files it has not changed. Restarts are queued, so none is dropped and a duplicate is a no-op.
