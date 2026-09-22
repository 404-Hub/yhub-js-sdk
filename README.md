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

## Realtime rooms

Enable Realtime in the site's dashboard before joining. SDK 1.2.0 provides:

```js
const room = await yhub.realtime.join('game:abc');
const unsubscribe = room.on('unit_move', ({ from, payload }) => {
  updateUnit(from, payload);
});
const stopPresence = room.presence.onChange(users => updatePlayers(users));
room.onError(error => showConnectionError(error.message));
room.onStatus(status => showConnectionStatus(status));
room.send('unit_move', { unit: 'u1', x: 10, y: 20 });

// Dispose when leaving the page.
unsubscribe();
stopPresence();
room.close();
```

Ordinary room names are public. `user:game` requires an app-user session. `owner:game` creates a separate room for each authenticated user. `server:game` requires a server credential with `realtime:join`; never expose that credential in browser code. Prefixes are part of the room name.

The SDK renews its room ticket after a transient disconnect and keeps event subscriptions. Authorization failures stop reconnects. Configure `{ reconnect: false }` or `{ maxReconnectAttempts: 3 }` as the second argument to `join()` when needed. Messages are never queued while disconnected or replayed after reconnecting. `send()` throws when disconnected, congested or over the payload limit.

## Development

```bash
npm ci
npm run check
```
