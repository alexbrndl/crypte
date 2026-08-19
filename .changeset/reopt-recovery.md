---
'@crypte/cli': patch
---

The preview survives a dependency the optimiser discovers mid-load.

`crypte dev` now pre-bundles the packages `crypte.config.ts` imports, read from the same imports as the adapter and the global `wrap`. A linked workspace package used to be served as a graph module, so the dependency URLs it carried outlived a re-optimisation: the browser ended up assembling four generations of bundles at once, reported it as a missing export named `t`, and the preview stayed blank until a manual reload.

Measured on the demo, where the failure is now reproducible on demand: a first visit with no warm-up, so the optimiser discovers the linked package's own dependencies while the page loads. Triggered on a settled page, the same re-optimisation never broke anything, because Vite reloads the frame and the preview comes back on its own.

Nothing changes for a project that already declared its adapter in place, which is every project: the list is read from the imports the configuration already carries.
