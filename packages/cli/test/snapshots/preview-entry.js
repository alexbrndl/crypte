import { createPreviewChannel as __crypte_channelOf, propsOfStory as __crypte_propsOf, wrapsOf as __crypte_wrapsOf } from '@crypte/core/preview'
import "<racine>/packages/cli/test/fixture/src/styles/app.css"

const __crypte_modules = {}
const __crypte_broken = {}

await Promise.all([
  import("/stories/Gardee.tsx").then((module) => { __crypte_modules["/stories/Gardee.tsx"] = module }, (error) => { __crypte_broken["/stories/Gardee.tsx"] = error }),
])
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

  const __crypte_path = `/${entry.storyFile}`

  // Thrown here rather than swallowed: the channel turns it into an `error`
  // carrying this story's id, which is what names the file at fault.
  const __crypte_failure = __crypte_broken[__crypte_path]
  if (__crypte_failure) throw __crypte_failure

  const module = __crypte_modules[__crypte_path]
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
  const __crypte_paths = new Set(["/stories/Gardee.tsx"])

  // Accepted whole. A story file that React cannot refresh sends Vite back to
  // this module, which then runs again rather than reloading the frame.
  import.meta.hot.accept()

  // Each story file an update touched, imported again here with its own
  // timestamp. Vite says nothing when a module fails to reload: it keeps the
  // old one, and the shell showed the version before the edit as rendered.
  // A failure is kept and thrown at the next render, a success forgets it.
  import.meta.hot.on('vite:afterUpdate', async ({ updates }) => {
    const touched = updates.filter((one) => __crypte_paths.has(one.path))
    if (touched.length === 0) return

    await Promise.all(
      touched.map((one) =>
        import(/* @vite-ignore */ `${one.path}?t=${one.timestamp}`).then(
          (module) => {
            __crypte_modules[one.path] = module
            delete __crypte_broken[one.path]
          },
          (error) => {
            __crypte_broken[one.path] = error
          },
        ),
      ),
    )

    __crypte_channel.again()
  })

  // Running again builds a new channel and a new adapter. The old ones go
  // first: left behind, the old channel still answers the shell and the old
  // root still holds the container, so each save leaked one of each.
  // `unmount` is optional: the contract does not require it of an adapter.
  import.meta.hot.dispose(() => {
    __crypte_channel.dispose()
    __crypte_adapter.unmount?.()
  })
}