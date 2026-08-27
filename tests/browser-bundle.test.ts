import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('browser bundle', () => {
  it('installs the default yhub client on globalThis', async () => {
    const bundle = await readFile(new URL('../dist/yhub.js', import.meta.url), 'utf8')
    expect(bundle).toContain('globalThis.yhub=YhubSDK.yhub')
    expect(bundle).toContain('X-YHub-SDK-Version')
    expect(bundle).toContain('Telegram')
    expect(bundle).not.toContain('secret-profile')
    expect(bundle).not.toContain('secret-hash')

    const declarations = await readFile(new URL('../dist/yhub.d.ts', import.meta.url), 'utf8')
    expect(declarations).toContain('TelegramClient')
  })
})
