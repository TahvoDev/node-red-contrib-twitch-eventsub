# node-red-contrib-twitch-eventsub

Easy Node-RED nodes for Twitch creators. This project is still in early development.

## Nodes

- One node per EventSub event: follows, subscriptions and gift subs, channel point
  redeems, bits, cheers, raids, polls, predictions, hype trains, goals, charity,
  moderation, AutoMod, chat, warnings, whispers, stream online/offline and more.
- The palette groups them into `twitch ...` categories that follow Twitch's own
  EventSub areas: automod, bits & ads, channel, channel points, charity, chat, goals,
  hype train, moderation, polls, predictions, raids, stream, subscriptions and user.
- Every event node has its own icon, drawn from the event at build time.
- The Helix API nodes live under `twitch api`.
- Twitch Chat (IRC) nodes live under `Twitch Chat`: receive and send chat messages,
  run commands, moderate, announce, join and leave channels.

## Twitch Chat

The `Twitch Chat` nodes talk to chat over Twitch's IRC gateway using
[`@twurple/chat`](https://www.npmjs.com/package/@twurple/chat). They share one connection through the
**twitch-chat-connection** config node.

### The connection node

Drop the config node once, then point the other chat nodes at it from their **Connection** dropdown:

- **Account** — a `twitch-api-config` node. The chat connection borrows that node's OAuth token;
  it never stores credentials itself.
- **Channels** — comma-separated channel logins to join on startup, without a leading `#`
  (for example `channelname1, channelname2`).
- **Bot** — applies Twitch's known-bot rate limits. Only enable it if the account is registered as
  a known bot, otherwise messages can be dropped.

The node shows **Connected**, **Reconnecting** or **Disconnected** and every node using it mirrors
that status.

### Broadcaster vs bot accounts

The account used for chat is the account the bot logs in as, so it is usually easiest to create a
**second `twitch-api-config` node** for a dedicated bot account and select it in the chat connection.
The broadcaster account can stay as the main login for EventSub. To let the bot post in the
broadcaster's channel, give the bot account moderator (or at least chat) permissions there. If you
only use one account, that account must be the broadcaster or a moderator of the channel it posts in.

Both config nodes need these OAuth scopes:

- `chat:read`, `chat:edit`, `user:read:chat`, `channel:moderate`
- `moderator:manage:banned_users`, `moderator:manage:chat_messages`, `moderator:manage:announcements`

`chat:read` and `chat:edit` are needed to read and send over IRC. The `moderator:*` scopes are only
needed for the moderation nodes. If your existing token was created before you added a scope, log the
account in again so the new scope is granted.

### Nodes

- **chat in** — emits a message for each incoming chat message (channel, user, text, badges, bits, …).
- **chat send** — sends `msg.payload` to a channel.
- **chat reply** — like **chat send**, but threads the message using `msg.replyTo`.
- **chat command** — placed after **chat in**, matches one `!command` and enriches the message with
  `msg.command` and `msg.args`, with optional mod / sub / VIP / broadcaster checks.
- **chat ban**, **chat timeout**, **chat unban** — moderation actions.
- **chat delete message** — deletes a single message by its ID.
- **chat announce** — sends a highlighted announcement, optionally with a color.
- **chat clear** — clears the chat.
- **chat join**, **chat part** — join or leave a channel at runtime.

The moderation nodes go through the Twitch Helix API (Twitch's IRC gateway no longer accepts the
moderation chat commands), so the authenticated account must be a moderator or the broadcaster of the
target channel.

`chat in` sets `msg.user` to the **sender** of the message, and the `ban` / `timeout` / `unban` nodes
fall back to it as the target. Wire `chat in` straight into a moderation node and the sender is
actioned; set `msg.targetUser` to moderate someone else.

### Example: reply to `!hello`

`chat in` → `chat command` (command `hello`, prefix `!`) → a function node that builds the reply →
`chat send`. The command node passes the original message through, so `msg.user` and `msg.channel`
are still available:

```js
msg.payload = `Hello, ${msg.user}!`;
return msg;
```

Leave **chat send**'s channel blank so it uses the channel from `msg.channel`, and set **chat in**'s
channel to the same channel (or leave it blank to listen to every joined channel).

## Testing without a Twitch account

The Twitch API config node has an optional mock mode, so a flow can be developed and
exercised against a local [Twitch CLI](https://dev.twitch.tv/docs/cli/) mock instead of a
real broadcaster account:

1. Start the mock. The API and the EventSub WebSocket server have to answer on the same
   port as far as the nodes are concerned, so they sit behind one proxy:
   ```sh
   twitch mock-api start --port 8081
   twitch event websocket start-server --port 8082 --require-subscription
   node scripts/mock/proxy.js
   ```
2. In the Twitch API config node, open the mock section, set **Mock Port** to the proxy
   port (8080) and **Mock User ID** to the broadcaster the mock should report. Leave the
   client id empty to use a mock-only client.
3. Import `examples/mock-all-nodes.json` to get every event node wired to a debug node.
4. Fire the events:
   ```sh
   node scripts/mock/fire-all-events.js
   ```

`fire-all-events.js` reads the subscriptions the mock accepted, fires each one through
the CLI and reports how many the mock delivered and how many notifications the client
rejected. The Twitch CLI can only generate the event types it supports, so a few nodes
stay quiet; the script reports exactly which ones it could not trigger.

## End-to-end test

`npm run test:e2e` does the whole run above automatically: it builds the package, builds
the mock images if they are missing, starts Node-RED against the Twitch CLI mock with
`examples/mock-all-nodes.json`, installs nothing into your normal Node-RED data dir
(everything is temporary) and fails if any generated event was rejected or never
delivered. It needs podman (preferred) or docker. That requirement is isolated to the
test: `npm install`, `npm run build` and `npm run check` work without a container engine.

## Adding a new event

All EventSub events live in `src/twitch/eventsub/eventsub-registry.ts`. Add one entry
there (type, palette label, description, Twurple `subscribe` call and the payload field
mapping), then run `npm run build`. The build generates the runtime module and editor
file for the new node and updates the `node-red` node manifest in `package.json`. To
regenerate only the manifest, run `npm run sync`; `npm run check` fails if the manifest
has drifted from the registry. The field mapping supports a plain property name, a
renamed property, a default value and a `map` function for anything more complex.

The palette category and icon are derived as well. `categoryFor` in the registry maps the
event area to a `twitch ...` category, and `eventsub-icons.ts` maps the event to a glyph
that the build renders white on Node-RED's standard 40x60 icon canvas, so it keeps the
same padding as the stock icons. To use a new glyph, `npm i --no-save bootstrap-icons`,
add the name in `eventsub-icons.ts`, then run `npx tsc && npm run collect-glyphs` to
vendor its path into `src/icons/glyphs.json`.

## Credits

- Twitch EventSub for Node-RED: [xurei/node-red-contrib-twitch-eventsub](https://github.com/xurei/node-red-contrib-twitch-eventsub/tree/master)
- [Twurple](https://www.npmjs.com/package/@twurple/api)
- Icons: [Bootstrap Icons](https://icons.getbootstrap.com/) (MIT)
