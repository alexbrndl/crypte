---
'@crypte/cli': patch
'@crypte/tokens': patch
---

Internal tidy-up, with no change to what either package does: nine exports nothing imported are gone, and so are the fallbacks and guards no input could reach, thirty-two branch slots in all, each one measured unreachable before it was removed.
