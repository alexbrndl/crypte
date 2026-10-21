---
'@crypte/core': patch
'@crypte/cli': patch
---

Try a token value before writing it: the token panel takes a value, the preview renders with it at once, the token tile shows it, the panel lists the components it affects, through the aliases that point at the token, each leading to a story where the preview shows it, and Reset brings the file's value back, one token from its panel or all of them from the status bar. `render` carries the values tried in an optional `tokens`, set on the preview's root until the next render drops them.
