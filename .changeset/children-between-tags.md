---
'@crypte/cli': minor
---

The call code a manifest carries now writes `children` between the tags, `<Badge>New</Badge>` rather than `<Badge children="New" />`. Both render; only one is what anyone writes, and this field exists to be copied.
