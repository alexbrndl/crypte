---
'@crypte/cli': patch
'@crypte/a11y': patch
---

The health view audits every story in light and in dark with the a11y plugin, on demand: an a11y gauge in the score, an accessibility page listing each violation by story and rule, and the elements at fault in the panel. The fields of the a11y results are now read by the shell, which names a story it cannot read rather than break.
