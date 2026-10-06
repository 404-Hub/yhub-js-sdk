import { describe, expect, it, vi } from 'vitest'
import { YhubClient, type AccessGrant } from '../src/index.js'

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const user = (permissions: AccessGrant[]) => ({ id: 1, email: null, name: 'Editor', created_at: '', updated_at: '', roles: ['editor', 'user'], permissions })

describe('role permissions', () => {
  it('uses explicit grants, distinguishes owner/all, and refreshes after removal', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ token: 'yusr_test', user: user([{ entity: 'posts', action: 'read', scope: 'all' }, { entity: 'posts', action: 'update', scope: 'owner' }, { entity: 'posts', action: 'create' }]) }))
      .mockResolvedValueOnce(response({ user: user([]) }))
    const auth = new YhubClient({ baseUrl: 'https://demo.yhub.net', fetch: fetchMock }).auth
    expect(auth.rolesSupported).toBe(false)
    expect(auth.can('posts', 'read')).toBe(false)
    await auth.login({ email: 'test@example.test', password: 'test' })
    expect(auth.rolesSupported).toBe(true)
    expect(auth.can('posts', 'read', 'owner')).toBe(true)
    expect(auth.can('posts', 'read', 'all')).toBe(true)
    expect(auth.can('posts', 'update')).toBe(true)
    expect(auth.can('posts', 'update', 'all')).toBe(false)
    expect(auth.can('posts', 'create')).toBe(true)
    expect(auth.can('posts', 'create', 'owner')).toBe(false)
    expect(auth.can('posts', 'delete')).toBe(false)
    expect(auth.can('other', 'read')).toBe(false)
    await auth.me()
    expect(auth.can('posts', 'update')).toBe(false)
  })

  it('does not infer permissions on a legacy runtime and clears rejected sessions', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ user: { id: 1 } }))
      .mockResolvedValueOnce(response({ token: 'yusr_test', user: user([{ entity: 'posts', action: 'read', scope: 'all' }]) }))
      .mockResolvedValueOnce(response({ message: 'Unauthenticated' }, 401))
    const auth = new YhubClient({ baseUrl: 'https://demo.yhub.net', fetch: fetchMock }).auth
    await auth.me()
    expect(auth.rolesSupported).toBe(false)
    expect(auth.can('posts', 'read')).toBe(false)
    await auth.loginWithTelegram('test-data')
    expect(auth.can('posts', 'read')).toBe(true)
    await expect(auth.me()).rejects.toMatchObject({ status: 401 })
    expect(auth.rolesSupported).toBe(false)
    expect(auth.can('posts', 'read')).toBe(false)
  })

  it('clears the profile even when logout fails and preserves write-only responses', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ token: 'yusr_test', user: user([{ entity: 'posts', action: 'create' }]) }))
      .mockResolvedValueOnce(response({ data: { id: 12 } }, 201))
      .mockResolvedValueOnce(response({ message: 'Failure' }, 503))
    const client = new YhubClient({ baseUrl: 'https://demo.yhub.net', fetch: fetchMock })
    await client.auth.register({ email: 'test@example.test', password: 'test' })
    await expect(client.db.collection<{ id: number; title: string }>('posts').create({ title: 'Test' })).resolves.toEqual({ id: 12 })
    await expect(client.auth.logout()).rejects.toMatchObject({ status: 503 })
    expect(client.auth.can('posts', 'create')).toBe(false)
    expect(await client.auth.token()).toBe(null)
  })
  it('ignores a previous session me response after logout or a different login', async () => {
    for (const transition of ['logout', 'login']) {
      let resolveMe!: (value: Response) => void
      const delayedMe = new Promise<Response>(resolve => { resolveMe = resolve })
      const fetchMock = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(response({ token: 'yusr_a', user: user([{ entity: 'posts', action: 'read', scope: 'all' }]) }))
        .mockImplementationOnce(() => delayedMe)
        .mockResolvedValueOnce(transition === 'logout' ? new Response(null, {status: 204}) : response({ token: 'yusr_b', user: user([]) }))
      const auth = new YhubClient({baseUrl:'https://demo.yhub.net',fetch:fetchMock}).auth
      await auth.login({email:'a@example.test',password:'test'})
      const oldMe = auth.me()
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
      if (transition === 'logout') await auth.logout()
      else await auth.login({email:'b@example.test',password:'test'})
      resolveMe(response({user:user([{entity:'posts',action:'read',scope:'all'}])}))
      await oldMe
      expect(auth.can('posts','read')).toBe(false)
      expect(await auth.token()).toBe(transition === 'logout' ? null : 'yusr_b')
    }
  })

  it('ignores a late login and a previous session authentication error', async () => {
    let resolveA!: (value: Response) => void
    const delayedA = new Promise<Response>(resolve=>{resolveA=resolve})
    let resolveMe!: (value: Response) => void
    const delayedMe = new Promise<Response>(resolve=>{resolveMe=resolve})
    const fetchMock=vi.fn<typeof fetch>()
      .mockImplementationOnce(()=>delayedA)
      .mockResolvedValueOnce(response({token:'yusr_b',user:user([])}))
      .mockImplementationOnce(()=>delayedMe)
      .mockResolvedValueOnce(response({token:'yusr_c',user:user([{entity:'posts',action:'read',scope:'all'}])}))
    const auth = new YhubClient({baseUrl:'https://demo.yhub.net',fetch:fetchMock}).auth
    const loginA=auth.login({email:'a@example.test',password:'test'})
    await vi.waitFor(()=>expect(fetchMock).toHaveBeenCalledTimes(1))
    await auth.login({email:'b@example.test',password:'test'})
    resolveA(response({token:'yusr_a',user:user([{entity:'posts',action:'delete',scope:'all'}])}))
    await loginA
    expect(await auth.token()).toBe('yusr_b')
    expect(auth.can('posts','delete')).toBe(false)
    const oldMe=auth.me()
    await vi.waitFor(()=>expect(fetchMock).toHaveBeenCalledTimes(3))
    await auth.login({email:'c@example.test',password:'test'})
    resolveMe(response({message:'Expired A session'},401))
    await expect(oldMe).rejects.toMatchObject({status:401})
    expect(auth.can('posts','read')).toBe(true)
  })

})
