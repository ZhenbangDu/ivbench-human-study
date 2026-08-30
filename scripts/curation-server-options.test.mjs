import { describe, expect, it } from 'vitest'
import { curatorViteOptions } from './curation-server-options.mjs'

describe('curatorViteOptions', () => {
  it('isolates the middleware WebSocket port from other curator servers', () => {
    expect(curatorViteOptions(4318)).toEqual({
      root: process.cwd(),
      appType: 'spa',
      server: {
        middlewareMode: true,
        ws: { port: 24_318 },
      },
    })
  })
})
