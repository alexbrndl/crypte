---
'@crypte/cli': patch
'@crypte/tokens': patch
---

Internal tidy-up, with no change to what either package does: nine exports nothing imported and fifteen fallbacks no input could take are gone, each one measured unreachable before it was removed.
