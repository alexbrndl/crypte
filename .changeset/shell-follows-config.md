---
'@crypte/cli': patch
---

The shell reads the list of plugins again whenever the preview says `ready`, so an edit of `crypte.config.ts` shows its panels and refusals without a manual reload, and a panel that did not change keeps its state. A message a panel sends while the preview reloads is now dropped and named in the console instead of lost without a trace.
