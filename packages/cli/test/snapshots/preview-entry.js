import { createPreviewChannel as __crypte_channelOf, propsOfStory as __crypte_propsOf, wrapsOf as __crypte_wrapsOf } from '@crypte/core/preview'
import * as __crypte_story0 from "/stories/Gardee.tsx"
import "<racine>/packages/cli/test/fixture/src/styles/app.css"

const __crypte_modules = {
  "/stories/Gardee.tsx": __crypte_story0,
}
const __crypte_manifest = await fetch("/@crypte/manifest.json").then((answer) => answer.json())

const __crypte_adapter = { name: 'fixture' }
const __crypte_wrap = undefined

const __crypte_container = document.getElementById('root')
if (!__crypte_container) throw new Error('preview container not found')

// An entry carries the path of its story file, so finding its module is a
// lookup and never a guess about a name. Stories only: the manifest carries
// other natures, and this frame renders one.
const __crypte_byId = new Map(
  __crypte_manifest.entries
    .filter((entry) => entry.type === 'story')
    .map((entry) => [entry.id, entry]),
)

function __crypte_render(id, overrides) {
  const entry = __crypte_byId.get(id)
  if (!entry) throw new Error(`unknown story: ${id}`)

  const module = __crypte_modules[`/${entry.storyFile}`]
  if (!module) throw new Error(`no module for ${entry.storyFile}`)

  // The module holds the component and its definition, never a component
  // on its own: mounting `module.default` handed React an object, and the
  // story rendered nothing. Measured in a browser.
  const { component, definition } = module.default

  const props = __crypte_propsOf(definition, entry.name, overrides)

  // The wrappers last: the adapter nests them, outermost first, and the
  // global one of section 2.5 comes from the configuration text.
  __crypte_adapter.mount(__crypte_container, component, props, __crypte_wrapsOf(__crypte_wrap, definition))
}

const __crypte_channel = __crypte_channelOf({ render: __crypte_render })

if (import.meta.hot) {
  const __crypte_paths = ["/stories/Gardee.tsx"]

  import.meta.hot.accept(__crypte_paths, (updated) => {
    updated.forEach((module, index) => {
      if (module) __crypte_modules[__crypte_paths[index]] = module
    })

    __crypte_channel.again()
  })
}