---
'@crypte/cli': minor
---

Crypte writes a reduced fingerprint of its catalogue, next to the manifest.

The manifest is a build artefact and Git ignores it. The fingerprint is committed, and it is what gives a catalogue a history: per entry, the identifier, the component as `file#export`, the status, the sorted prop names, and one digest folding everything else. Section 4.6 of the contracts says which of the two files is the truth, and it is the manifest.

The digest sorts its keys at every depth, so writing the same fields in another order changes nothing. A story with no `meta` gets the status `none`, so adding `status: 'draft'` shows up as the change it is. The prop names come from the entry's own `props`, not from the component's declared surface: a story that changes which props it sets now moves the fingerprint even when its component does not.

Measured on the shape the writer actually produces, indentation included: 706 KB raw for 500 stories, and 268 bytes per story for the fingerprint.
