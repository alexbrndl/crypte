---
'@crypte/controls': patch
'@crypte/cli': patch
'@crypte/core': patch
---

Adds `@crypte/controls`, which edits a story's props live from the shell, one field per prop. A story entry now carries `propsUnread` when its component's props could not be read, so an empty `details` no longer hides that. Such an entry's fingerprint moves once: run `crypte dev` after upgrading, and `crypte check` passes again.
