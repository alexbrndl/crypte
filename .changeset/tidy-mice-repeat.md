---
'@crypte/cli': patch
---

Internal tidy-up, with no change to what the CLI does: nine exports nothing imported and eight fallbacks no input could take are gone, each one measured unreachable before it was removed.
