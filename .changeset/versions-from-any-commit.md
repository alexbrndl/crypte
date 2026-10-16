---
'@crypte/cli': minor
---

The committed fingerprint gains a `tokens` section, each token with the literal of each theme. Committed fingerprints are stale once: run `crypte dev` and commit `.crypte/fingerprint.json`. `/@crypte/changes.json` can start from a branch, a tag, a commit or a date, and adds the token changes; `/@crypte/versions.json` lists the default branch and the tags. `crypte dev` now watches the style sheet declared as `css`.
