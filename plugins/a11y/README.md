# @crypte/a11y

The Crypte plugin that analyses each render with axe-core, in a panel and in the health view. Added by hand, since axe-core weighs on the preview:

```ts
import a11y from '@crypte/a11y'
import { defineConfig } from '@crypte/cli'

export default defineConfig({
  // ...
  plugins: [a11y()],
})
```

See the repository for the whole picture: https://github.com/alexbrndl/crypte. Version `0.x`: no stability promise yet.
