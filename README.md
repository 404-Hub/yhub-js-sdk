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

## Development

```bash
npm ci
npm run check
```
