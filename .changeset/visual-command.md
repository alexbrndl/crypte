---
'@crypte/cli': patch
---

New `crypte visual` command: it renders each story of the static build in Chromium, through the Playwright the project installs, and compares it with its committed baseline in `.crypte/visual`. A story that differs is written to `crypte-visual/` and the command exits 1; `--update` writes the baselines.
