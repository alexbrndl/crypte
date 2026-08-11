import { createPreviewChannel } from '@crypte/core/preview'
import { createAdapter } from '@crypte/react'
import { Badge } from './Badge'

const container = document.getElementById('root')
if (!container) throw new Error('conteneur de preview introuvable')

const adapter = createAdapter()

createPreviewChannel({
  render(_id, overrides) {
    adapter.mount(container, Badge, overrides)
  },
})
