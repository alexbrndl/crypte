---
'@crypte/cli': patch
---

A Vue project is recognised everywhere a React one is: `crypte check` reports a `.vue` component with no story, the health view counts `.vue` files and offers a Vue story skeleton, the empty stories guide writes a Vue story, and `crypte init` writes a Vue configuration with `vue()` in `vite.plugins`. A default export is now reported under its file's name rather than `default`.
