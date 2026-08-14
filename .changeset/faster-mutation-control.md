---
'@crypte/cli': patch
---

Nothing changes for users of the packages. The repository's mutation control now runs only the test file a guarantee names, and falls back to the whole suite when it names none.

Measured on 90 guarantees: 4 min 10 s before, 1 min 57 s after. The diagnostic that says a mutation was caught by something other than its guardian is kept, since it is what found two real defects; it now costs its price only when the fast path cannot conclude.
