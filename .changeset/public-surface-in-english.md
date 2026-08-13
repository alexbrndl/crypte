---
'@crypte/cli': patch
---

The messages Crypte prints are now in English.

A missing `crypte.config.ts`, a configuration that declares no `stories` or no `adapter`, a `tsconfig.json` that cannot be read, a path that is not an array: each of these now reads in English. The wording changed, the conditions did not, and every message still names the file and the field at fault.

The diagnostic a plugin author gets when a message declares a non-literal `type` reads in English too.
