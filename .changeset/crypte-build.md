---
'@crypte/cli': patch
'@crypte/ui': patch
---

Add `crypte build`, which writes the workshop as a static folder, `crypte-static/`, served by any host and below any path. It also writes the fingerprint, so `crypte check` no longer needs a running server. `Select` now shows the current label of its chosen option.
