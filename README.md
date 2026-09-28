# node-red-contrib-twitch-eventsub

Easy Node-RED nodes for Twitch creators. This project is still in early development.

## Nodes

- One node per EventSub event: follows, subscriptions and gift subs, channel point
  redeems, bits, cheers, raids, polls, predictions, hype trains, goals, charity,
  moderation, AutoMod, chat, warnings, whispers, stream online/offline and more.
- The palette groups them into `twitch ...` categories that follow Twitch's own
  EventSub areas: automod, bits & ads, channel, channel points, charity, chat events,
  goals, hype train, moderation, polls, predictions, raids, stream, subscriptions and user.
- Every event node has its own icon, drawn from the event at build time.
- The Helix API nodes live under `twitch api`.
- Twitch Chat (IRC) nodes live under `twitch chat (irc)`: receive and send chat messages,
  run commands, moderate, announce, join and leave channels.

## Twitch Chat

The `twitch chat (irc)` nodes talk to chat over Twitch's IRC gateway using
[`@twurple/chat`](https://www.npmjs.com/package/@twurple/chat). They share one connection through the
**twitch-chat-connection** config node.

### The connection node

Drop the config node once, then point the other chat nodes at it from their **Connection** dropdown:

- **Account** — a `twitch-api-config` node. The chat connection borrows that node's OAuth token;
  it never stores credentials itself.
- **Channels** — comma-separated channel logins to join on startup, without a leading `#`
  (for example `channelname1, channelname2`).

The connection always identifies as a bot, so Twitch applies its bot rate limits rather than the
tighter anonymous-user ones. Register the account as a known bot with Twitch to get the full
allowance.

The node shows **Connected**, **Reconnecting** or **Disconnected** and every node using it mirrors
that status.

### Broadcaster vs bot accounts

The account used for chat is the account the bot logs in as, so it is usually easiest to create a
**second `twitch-api-config` node** for a dedicated bot account and select it in the chat connection.
The broadcaster account can stay as the main login for EventSub. To let the bot post in the
broadcaster's channel, give the bot account moderator (or at least chat) permissions there. If you
only use one account, that account must be the broadcaster or a moderator of the channel it posts in.

Both config nodes need these OAuth scopes:

- `chat:read`, `chat:edit`, `user:read:chat`

The **bot's** `twitch-api-config` node additionally needs the moderation scopes:

- `channel:moderate`
- `moderator:manage:banned_users`, `moderator:manage:chat_messages`, `moderator:manage:announcements`

`chat:read` and `chat:edit` are needed to read and send over IRC; the `moderator:*` scopes are needed
for the moderation nodes. Keep them **on the bot's config node only**, never on the broadcaster's
EventSub node: a token that can ban and clear chat is materially worse if it leaks, and the chat
nodes only ever use the bot account. If your existing token was created before you added a scope, log
the account in again so the new scope is granted.

### Nodes

- **chat in** — emits a message for each incoming chat message (channel, user, text, badges, bits, …),
  with an optional **Ignore own messages** switch for the connection's own account.
- **chat send** — sends `msg.payload` to a channel, or `msg.text` if there is no payload.
- **chat reply** — like **chat send**, but threads the message using `msg.replyTo`, or the
  `msg.id` that **chat in** emits.
- **chat command** — placed after **chat in**, matches one `!command` up to a word boundary and
  enriches the message with `msg.command` and `msg.args`, with optional mod / sub / VIP /
  broadcaster checks.
- **chat ban**, **chat timeout**, **chat unban** — moderation actions. The target is
  `msg.targetUser` (login) or `msg.targetUserId` (id).
- **chat delete message** — deletes a single message by its ID (`msg.messageId` or `msg.id`).
- **chat announce** — sends a highlighted announcement in one of Twitch's five announcement
  colours (`msg.announceColor`, `primary` by default) from `msg.payload`, or `msg.text` when there
  is no payload.
- **chat clear** — clears the whole channel.
- **chat join**, **chat part** — join or leave a channel at runtime.

The moderation nodes go through the Twitch Helix API (Twitch's IRC gateway no longer accepts the
moderation chat commands), so the authenticated account must be a moderator or the broadcaster of the
target channel. Which account triggered the action is not sent: Twitch requires the ban/clear/announce
request to be made by the token's own user, so the bot is what Twitch logs.

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

## Helix API nodes

The `twitch api` nodes call Twitch's Helix REST API. Every node has one input and one output, so it
fits at the start, middle or end of a flow, and every node needs a `twitch-api-config` in its
**Config** dropdown. Results land on `msg.payload` as plain objects — no Twurple class instances — so
they can be fed straight into a debug node, a template or a function node.

Wherever the API needs a user, channel or game ID, the node also accepts a username or category name
and resolves it, so `broadcaster` can be `shroud` or `44322889`. Most channel and moderation nodes
accept a blank **Broadcaster** and default to the authenticated account.

Every node is forgiving about its input: a string, a number, a boolean, a Buffer, an array or null
is coerced or ignored, and anything missing falls back to the node's config field. `msg.payload` can
override a node's primary field, and each node also accepts the named overrides documented in its
help panel. Paged nodes set `msg.pagination` (`{ cursor }`) and `msg.total` when Twitch reports it.

### Tiers

Helix nodes are grouped into three tiers so the palette stays small:

- **core** (default): the everyday read/write nodes — users, streams, channel info, chat, bans, clips.
- **extended**: moderators, VIPs, blocked terms, chat settings, Channel Points, polls, predictions,
  schedule, raids, ads, videos, stream markers.
- **advanced**: bits, subscriptions, teams, charity, hype train, goals, whispers.

Only the enabled tiers are registered in the palette. Enable more in your Node-RED `settings.js`:

```js
module.exports = {
    // ...
    twitchApi: {
        tiers: ['core', 'extended'],
    },
};
```

The default is `['core']`. A flow that uses a node from a disabled tier shows it as an unknown node
until that tier is enabled again; the type stays registered, so nothing else breaks. OAuth scopes
are always requested for every tier in a single login, so enabling a tier never forces you to
re-authenticate.

### Nodes

The catalogue below is generated from the Helix specs at build time — do not edit it by hand.

<!-- helix-nodes:start -->
| Node | Actions | Tier | Scopes |
| --- | --- | --- | --- |
| get users | — | core | — |
| blocks | `list`, `block`, `unblock` | core | `user:read:blocked_users`, `user:manage:blocked_users` |
| get auth user | — | core | — |
| update bio | — | core | `user:edit` |
| get channel info | — | core | — |
| update channel info | — | core | `channel:manage:broadcast` |
| get followers | — | core | `moderator:read:followers` |
| get followed channels | — | core | `user:read:follows` |
| ads | `get`, `snooze`, `start` | extended | `channel:read:ads`, `channel:manage:ads`, `channel:edit:commercial` |
| get stream key | — | advanced | `channel:read:stream_key` |
| channel editors | — | advanced | `channel:read:editors` |
| send chat message | — | core | `user:write:chat` |
| send announcement | — | core | `moderator:manage:announcements` |
| send shoutout | — | core | `moderator:manage:shoutouts` |
| chat moderation | `chatters`, `clear`, `delete` | core | `moderator:read:chatters`, `moderator:manage:chat_messages` |
| chat settings | `get`, `update` | extended | `moderator:manage:chat_settings` |
| get emotes | — | core | — |
| get chat badges | — | core | — |
| chat colour | `get`, `set` | extended | `user:manage:chat_color` |
| user emotes | — | extended | `user:read:emotes` |
| shared chat | — | extended | — |
| bans | `ban`, `unban`, `list` | core | `moderator:manage:banned_users`, `moderation:read` |
| moderators | `list`, `add`, `remove` | extended | `moderation:read`, `channel:manage:moderators` |
| vips | `list`, `add`, `remove` | extended | `channel:read:vips`, `channel:manage:vips` |
| blocked terms | `list`, `add`, `remove` | extended | `moderator:read:blocked_terms`, `moderator:manage:blocked_terms` |
| moderation tools | `warn`, `automod`, `moderated`, `checkBan`, `checkMod` | extended | `moderator:manage:warnings`, `moderation:read`, `user:read:moderated_channels` |
| automod | `settings`, `update`, `held` | extended | `moderator:read:automod_settings`, `moderator:manage:automod_settings`, `moderator:manage:automod` |
| shield mode | `get`, `update` | extended | `moderator:read:shield_mode`, `moderator:manage:shield_mode` |
| unban requests | `list`, `resolve` | extended | `moderator:read:unban_requests`, `moderator:manage:unban_requests` |
| stream markers | `create`, `list` | extended | `channel:manage:broadcast`, `user:read:broadcast` |
| clips | `create`, `list` | core | `clips:edit` |
| videos | `list`, `delete` | extended | `channel:manage:videos` |
| games | `get`, `top`, `search` | advanced | — |
| search channels | — | advanced | — |
| raids | `start`, `cancel` | extended | `channel:manage:raids` |
| get streams | — | core | — |
| followed streams | — | extended | `user:read:follows` |
| channel points | `list`, `create`, `update`, `delete` | extended | `channel:read:redemptions`, `channel:manage:redemptions` |
| redemptions | `list`, `update` | extended | `channel:read:redemptions`, `channel:manage:redemptions` |
| polls | `list`, `create`, `end` | extended | `channel:read:polls`, `channel:manage:polls` |
| predictions | `list`, `create`, `end` | extended | `channel:read:predictions`, `channel:manage:predictions` |
| bits | `leaderboard`, `cheermotes` | advanced | `bits:read` |
| subscriptions | `list`, `check` | advanced | `channel:read:subscriptions`, `user:read:subscriptions` |
| schedule | `get`, `create`, `update`, `delete`, `segment`, `ical`, `settings` | extended | `channel:manage:schedule` |
| teams | `get`, `channel` | advanced | — |
| charity | `campaign`, `donations` | advanced | `channel:read:charity` |
| get hype train | — | advanced | `channel:read:hype_train` |
| get goals | — | advanced | `channel:read:goals` |
| send whisper | — | advanced | `user:manage:whispers` |
| content classification labels | — | advanced | — |
| drops | `list`, `byIds`, `update` | advanced | — |
| extensions | `released`, `live`, `bits`, `putBits`, `transactions` | advanced | — |
| user extensions | `installed`, `active` | advanced | `user:read:broadcast` |
<!-- helix-nodes:end -->

### Adding a Helix node

A Helix node is a spec, not a file pair. Add an entry to the matching group file under
`src/twitch/helix/specs/` (for example `specs/chat.ts`), then run `npm run build`. The build generates
the runtime module and editor html, updates `package.json` and refreshes the catalogue above.

Pick the smallest shape that fits:

- **Standalone spec** (`run`) for a resource with a single verb, or a daily-use verb that deserves
  its own palette entry (e.g. `get streams`).
- **Action node** (`actions`, `defaultAction`) when several verbs share one resource and mental
  model. Field names and message shapes stay constant across actions; `msg.action` selects one at
  runtime and the editor shows only the selected action's fields.

Every spec also declares a `tier` (`core` | `extended` | `advanced`), which is what keeps the
default palette small: only enabled tiers register.

```ts
defineHelix({
  type: 'twitch-helix-get-something',
  label: 'get something',
  help: 'One line shown in the node help.',
  scopes: ['channel:read:something'],
  fields: [
    { name: 'broadcaster', label: 'Broadcaster', kind: 'user', optional: true, hint: 'blank = authenticated user' },
    { name: 'limit', label: 'Limit', kind: 'int', default: 20 },
  ],
  // run only makes the twurple call; fields are already resolved and coerced
  run: ({ api, broadcasterId, input }) => api.channels.getSomething(broadcasterId, input.limit),
  // map returns a plain serialisable object, never a twurple class instance
  map: (result) => ({ id: result.id, name: result.name }),
})
```

For a list endpoint add `paged: { limit: 20, max: 1000 }` instead of declaring `limit`/`all`/`allMax`:
the factory walks the pages and sets `msg.pagination`/`msg.total`.

The **Login with Twitch** button on the config node requests all of these scopes, so authorising once
covers the whole `twitch api` palette. If you created your token before a node existed, log in again
to grant the new scope; the node reports `Missing scope … — re-authenticate the config node` rather
than failing with an opaque error.

See `examples/helix-channel-chat.json` for a starting flow that updates the channel title, reads the
followers and posts a chat message.

## Testing without a Twitch account

The Twitch API config node has an optional mock mode, so a flow can be developed and
exercised against a local [Twitch CLI](https://dev.twitch.tv/docs/cli/) mock instead of a
real broadcaster account:

1. Start the mock. The API and the EventSub WebSocket server have to answer on the same
   port as far as the nodes are concerned, so they sit behind one proxy:
   ```sh
   twitch mock-api start --port 8081
   twitch event websocket start-server --port 8082 --require-subscription
   node test/mock/proxy.js
   ```
2. In the Twitch API config node, open the mock section and set **Mock Port** to the proxy
   port (8080). The Twitch CLI prints a Client ID, an access token and a user ID when it
   starts: put the Client ID in the main **Client ID** field and the token and user ID in
   the mock **Mock Token** and **Mock User ID** fields. Helix endpoints 401 anything else.
3. Import `examples/mock-all-nodes.json` to get every event node wired to a debug node.
4. Fire the events:
   ```sh
   node test/e2e/fire-all-events.js
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

`npm run test:e2e:helix` is the Helix counterpart: it deploys a flow with the generated
Helix nodes, reads the credentials the Twitch CLI mock generates, and asserts the mock
received the request each node is supposed to make. Same container-engine requirement.

## Adding a new event

All EventSub events live in `src/twitch/eventsub/eventsub-registry.ts`. Add one entry
there (type, palette label, description, Twurple `subscribe` call and the payload field
mapping), then run `npm run build`. The build generates the runtime module and editor
file for the new node and updates the `node-red` node manifest in `package.json`. To
regenerate only the manifest, run `npm run sync`; `npm run check` fails if the manifest
has drifted from the registry. The field mapping supports a plain property name, a
renamed property, a default value and a `map` function for anything more complex.

The palette category and icon are derived as well. `categoryFor` in the registry maps the
event area to a `twitch ...` category (the chat events area is `twitch chat events`), and `eventsub-icons.ts` maps the event to a glyph
that the build renders white on Node-RED's standard 40x60 icon canvas, so it keeps the
same padding as the stock icons. To use a new glyph, `npm i --no-save bootstrap-icons`,
add the name in `eventsub-icons.ts`, then run `npx tsc && npm run collect-glyphs` to
vendor its path into `src/icons/glyphs.json`. The Twitch Chat nodes use the same
mechanism: their glyphs live in `src/twitch/chat/twitch-chat-icons.ts` and are
rendered by `scripts/generate-chat-icons.js`, and both generators share
`scripts/render-glyph-icon.js`.

## Credits

- Twitch EventSub for Node-RED: [xurei/node-red-contrib-twitch-eventsub](https://github.com/xurei/node-red-contrib-twitch-eventsub/tree/master)
- [Twurple](https://www.npmjs.com/package/@twurple/api)
- Icons: [Bootstrap Icons](https://icons.getbootstrap.com/) (MIT)
