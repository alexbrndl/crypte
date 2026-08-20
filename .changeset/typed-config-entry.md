---
'@crypte/cli': patch
---

A configuration written in TypeScript no longer leaves the preview blank.

The generated preview entry copies the expression `crypte.config.ts` gives to `adapter` and to `wrap`, so it carried the author's TypeScript into the browser: `adapter: createAdapter() as Adapter` reached it verbatim and died on a `SyntaxError` before the preview channel opened, which meant no `ready` and an empty frame with nothing on screen to say why.

`crypte dev` now compiles the entry before serving it. Measured on the demo with an assertion, a `satisfies` and a type argument, each of which was enough on its own to empty the frame.

Renaming the virtual module to `.ts` was measured and does not work: Vite does not transform a virtual module by its extension, so the entry is compiled by the plugin itself. The public path stays `/@crypte/preview.js`, which is what it serves.
