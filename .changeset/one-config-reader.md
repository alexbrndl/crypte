---
'@crypte/cli': patch
---

`crypte.config.ts` is now read by one reader instead of two. A quoted key such as `'adapter': …` is accepted where it used to be refused, a key written twice keeps its last value as JavaScript does rather than its first, and a computed key is no longer mistaken for the field.
