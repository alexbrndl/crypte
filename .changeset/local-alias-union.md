---
'@crypte/cli': patch
---

A prop typed by a type alias declared in the component file, such as `rank: Rank` with `type Rank = 'gold' | 'silver'`, now comes out as the enum its union describes.
