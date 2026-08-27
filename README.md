# YHub JavaScript SDK

Browser and TypeScript client for YHub hosted-site runtime APIs.

```html
<script src="https://yhub.net/sdk/v1/yhub.js"></script>
<script>
  const posts = yhub.db.collection('posts')
  const created = await posts.create({ title: 'Hello YHub' })
  const rows = await posts.list({ limit: 20 })
</script>
```

Use the ESM bundle with `import { yhub } from 'https://yhub.net/sdk/v1/yhub.esm.js'`.

## Telegram Mini Apps

When the site opens inside a Telegram Mini App, start the SDK before accessing owner-scoped data:

```js
const session = await yhub.telegram.start({ fullscreen: true })

if (session.authenticated) {
  const progress = yhub.db.collection('game_progress')
}
```

Outside Telegram, `start()` returns `not_available` without creating a user. The SDK uses only the official `Telegram.WebApp.initData` exchange and never exposes bot credentials or a `ydb_...` token.

## Development

```bash
npm ci
npm run check
```
