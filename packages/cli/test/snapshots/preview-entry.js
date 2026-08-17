import { createPreviewChannel, propsOfStory } from '@crypte/core/preview'
import * as story0 from "/stories/Gardee.tsx"
import "<racine>/packages/cli/test/fixture/src/styles/app.css"

const modules = {
  "/stories/Gardee.tsx": story0,
}
const manifest = await fetch("/@crypte/manifest.json").then((answer) => answer.json())

const adapter = { name: 'fixture' }

const container = document.getElementById('root')
if (!container) throw new Error('preview container not found')

// An entry carries the path of its story file, so finding its module is a
// lookup and never a guess about a name.
const byId = new Map(manifest.entries.map((entry) => [entry.id, entry]))

function render(id, overrides) {
  const entry = byId.get(id)
  if (!entry) throw new Error(`unknown story: ${id}`)

  const module = modules[`/${entry.storyFile}`]
  if (!module) throw new Error(`no module for ${entry.storyFile}`)

  // The module holds the component and its definition, never a component
  // on its own: mounting `module.default` handed React an object, and the
  // story rendered nothing. Measured in a browser.
  const { component, definition } = module.default

  adapter.mount(container, component, propsOfStory(definition, entry.name, overrides))
}

const channel = createPreviewChannel({ render })

if (import.meta.hot) {
  const paths = ["/stories/Gardee.tsx"]

  import.meta.hot.accept(paths, (updated) => {
    updated.forEach((module, index) => {
      if (module) modules[paths[index]] = module
    })

    channel.again()
  })
}