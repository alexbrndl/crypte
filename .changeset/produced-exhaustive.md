---
'@crypte/cli': patch
---

Nothing changes for users of the packages. The story reader's `produced` gains an explicit exhaustiveness guard, so a fourth kind of read stops compiling wherever the branching moves.

Measured before adding it: rewriting that `switch` as a ternary chain and adding a fourth kind left `vp check` and all 36 reader cases green, so the protection came from the declared return type alone and was lost in silence.
