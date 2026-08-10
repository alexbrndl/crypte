import { describe, expect, it } from 'vitest'
import { PROTOCOL_VERSION } from './index'

describe('protocol', () => {
  it('expose la version du protocole', () => {
    expect(PROTOCOL_VERSION).toBe(1)
  })
})
