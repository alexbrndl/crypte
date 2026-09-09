---
'@crypte/core': minor
---

`ShellMessage` no longer carries `update-overrides` or `set-globals`. Neither had any effect, and `render` already applies the overrides it is given. Both are in section 7 of the contracts, with what would bring them back.
