---
'@crypte/core': patch
'@crypte/cli': patch
---

The plugin contract is frozen. `PanelProps` and `PanelEvents` type what a panel receives and emits. A plugin key other than `name`, `shell`, `preview` and `node` is refused with its reason, and what was refused of a plugin is named in the shell as well as in the terminal.
