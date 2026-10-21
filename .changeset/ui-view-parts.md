---
'@crypte/ui': patch
'@crypte/cli': patch
---

`@crypte/ui` carries the parts the shell builds its views with, so a plugin's view builds with them too and looks like the shell's: `ColumnTitle`, `SidebarLink`, `Tree` (a generic tree that folds, nodes `{ key, label, children?, count?, dimmed?, selectable?, kind? }`), `ViewCanvas`, `SectionHeader`, `Badge`, `CardTable`, `EmptyNote` and `PanelSection`.
