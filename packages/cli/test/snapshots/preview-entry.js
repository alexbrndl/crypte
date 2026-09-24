import { createPreviewChannel as __crypte_channelOf, propsOfStory as __crypte_propsOf, wrapsOf as __crypte_wrapsOf } from '@crypte/core/preview'
import "<racine>/packages/cli/test/fixture/src/styles/app.css"

const __crypte_modules = {}
const __crypte_broken = {}
const __crypte_stale = new Map()
let __crypte_loadError
if (import.meta.hot) import.meta.hot.on('vite:error', ({ err }) => { __crypte_loadError = err })

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

// A failed fetch of a module, told by the error Vite reported for it: the
// file from the project root, its line, and the code frame as the stack.
function __crypte_named(failure) {
  const err = __crypte_loadError
  if (!err || !(failure instanceof TypeError) || !failure.message.startsWith('Failed to fetch dynamically imported module')) return failure
  const root = "<racine>/packages/cli/test/fixture/"
  const file = String(err.id ?? err.loc?.file ?? '').replace(root, '')
  const at = err.loc ? `${file}:${err.loc.line}:${err.loc.column}` : file
  const [first = '', ...frame] = String(err.message).split('\n')
  const named = new Error(`${at}: ${first.replace(`${err.id}: `, '').replaceAll(root, '')}`)
  named.stack = frame.join('\n').trim()
  return named
}

function __crypte_render(id, overrides) {
  const entry = __crypte_byId.get(id)
  if (!entry) throw new Error(`unknown story: ${id}`)

  const __crypte_path = `/${entry.storyFile}`

  // Thrown here rather than swallowed: the channel turns it into an `error`
  // carrying this story's id, which is what names the file at fault.
  const __crypte_failure = __crypte_broken[__crypte_path]
  if (__crypte_failure) throw __crypte_named(__crypte_failure)

  // A module that failed to reload leaves its old version in place, and this
  // frame cannot tell which stories use it: until it reloads, none renders.
  for (const failed of __crypte_stale.values()) throw __crypte_named(failed)

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

  // Each module an update touched, imported again here with its own
  // timestamp. Vite says nothing when a module fails to reload: it keeps the
  // old one, and the shell showed the version before the edit as rendered.
  // A failure is kept and thrown at the next render, a success forgets it.
  // This entry is left out: importing it again would run it a second time.
  import.meta.hot.on('vite:afterUpdate', async ({ updates }) => {
    const touched = updates.filter(
      (one) => one.type === 'js-update' && one.path !== "/@crypte/preview.js",
    )
    if (touched.length === 0) return

    await Promise.all(
      touched.map((one) =>
        import(/* @vite-ignore */ `${one.path}?t=${one.timestamp}`).then(
          (module) => {
            __crypte_stale.delete(one.path)
            if (!__crypte_paths.has(one.path)) return
            __crypte_modules[one.path] = module
            delete __crypte_broken[one.path]
          },
          (error) => {
            if (__crypte_paths.has(one.path)) __crypte_broken[one.path] = error
            else __crypte_stale.set(one.path, error)
          },
        ),
      ),
    )

    // A story file that failed because of another module stays broken, and
    // nothing touches its file once that module is repaired. Each one is tried
    // again, under a new timestamp so the browser does not return the failure.
    const waiting = Object.keys(__crypte_broken).filter((path) => !touched.some((one) => one.path === path))
    await Promise.all(
      waiting.map((path) =>
        import(/* @vite-ignore */ `${path}?t=${Date.now()}`).then(
          (module) => {
            __crypte_modules[path] = module
            delete __crypte_broken[path]
          },
          (error) => {
            __crypte_broken[path] = error
          },
        ),
      ),
    )

    __crypte_channel.again()
  })

  // Vite reports a module it could not load on this event, which can arrive
  // after the render that failed on it: rendering again lets the shell read
  // the file at fault instead of the story file.
  import.meta.hot.on('vite:error', () => __crypte_channel.again())

  // Running again builds a new channel and a new adapter. The old ones go
  // first: left behind, the old channel still answers the shell and the old
  // root still holds the container, so each save leaked one of each.
  // `unmount` is optional: the contract does not require it of an adapter.
  import.meta.hot.dispose(() => {
    __crypte_channel.dispose()
    __crypte_adapter.unmount?.()
  })
}