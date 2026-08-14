---
'@crypte/cli': patch
---

Nothing changes for users of the packages. The repository's mutation control now runs only the test file a guarantee names, and falls back to the whole suite when it names none.

Measured locally: 4 min 10 s for 90 guarantees before, 2 min 21 s for 92 after. The diagnostic that says a mutation was caught by something other than its guardian is kept, since it is what found two real defects; it now costs its price only when the fast path cannot conclude.
