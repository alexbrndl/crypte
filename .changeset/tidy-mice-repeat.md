---
'@crypte/cli': patch
'@crypte/tokens': patch
---

Internal tidy-up, with no change to what either package does: nine exports nothing imported, fifteen fallbacks and one branch no input could take are gone, each one measured unreachable before it was removed.
