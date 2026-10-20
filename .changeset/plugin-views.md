---
'@crypte/core': patch
'@crypte/cli': patch
---

A plugin may have a view of its own in the activity bar: `view: { label, icon }` on the plugin object, and the shell module's `view` export drawing its canvas, sidebar and panel. The item chosen in the view is kept in the address, `?view=<plugin>&item=<key>`. A label longer than 8 characters, an icon that is not a Hugeicons object, or a view without a shell module is refused with its reason.
