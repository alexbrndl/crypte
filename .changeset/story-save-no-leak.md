---
'@crypte/cli': patch
---

Saving a story file no longer leaves a React root and a channel listener behind in the preview, nor writes a `createRoot` error to the browser console on every save.
