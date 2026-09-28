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

### Nodes

The catalogue below is generated from the Helix specs at build time — do not edit it by hand.

<!-- helix-nodes:start -->
| Node | Purpose | Scopes |
| --- | --- | --- |
| get auth user | Fetches the profile of the currently authenticated Twitch user. | — |
| block user | Blocks or unblocks a Twitch user using the authenticated configuration context. | — |
| get users | Looks up Twitch profiles using explicit fields for IDs and Usernames. If both inputs are used simultaneously, the node merges and de-duplicates the results automatically. | — |
| get blocks | Gets a list of users blocked by the given Twitch user. | `user:read:blocked_users` |
| update bio | Updates the channel description of the authenticated Twitch user. | `user:edit` |
| get channel info | Gets a channel's title, game, language and tags. Leave Broadcaster blank to use the authenticated account. | — |
| update channel info | Updates a channel's title, game, tags or language. Only the fields you fill in are changed; the node fetches and returns the channel afterwards. The authenticated account must be the broadcaster. | `channel:manage:broadcast` |
| get followers | Lists a channel's followers, most recent first. Set User to a single login to just confirm whether that user follows. The authenticated account must be a moderator or the broadcaster. | `moderator:read:followers` |
| get followed channels | Lists the channels a user follows. Set Channel to a single login to just confirm whether the user follows it. Defaults to the authenticated account. | `user:read:follows` |
| get ad schedule | Gets a channel's ad schedule: available snoozes, next ad time and pre-roll free time. The authenticated account must be the broadcaster. | `channel:read:ads` |
| snooze next ad | Snoozes the channel's next ad when a snooze is available. The authenticated account must be the broadcaster. | `channel:manage:ads` |
| start commercial | Starts a commercial break on a channel. The authenticated account must be the broadcaster. | `channel:edit:commercial` |
| get channel teams | Lists the Twitch teams a channel belongs to. | — |
| get stream key | Gets the channel's stream key. Treat the result as a secret. The authenticated account must be the broadcaster. | `channel:read:stream_key` |
| send chat message | Sends a chat message to a channel as the authenticated account. | `user:write:chat` |
| send announcement | Sends a highlighted announcement in a channel, falling back to primary for any other colour. | `moderator:manage:announcements` |
| send shoutout | Sends a shoutout from one channel to another. | `moderator:manage:shoutouts` |
| get chatters | Lists the users currently in a channel's chat. | `moderator:read:chatters` |
| get chat settings | Gets a channel's chat settings, including the non-moderator delay. | — |
| update chat settings | Changes only the chat settings you set, leaving the rest unchanged. | `moderator:manage:chat_settings` |
| clear chat | Clears every message from a channel's chat. | `moderator:manage:chat_messages` |
| delete chat message | Deletes one chat message. | `moderator:manage:chat_messages` |
| get emotes | Lists a channel's emotes or Twitch's global emotes. | — |
| get chat badges | Lists a channel's custom chat badges or Twitch's global badges. | — |
| ban user | Bans or times out a user in a channel (duration in seconds, capped at two weeks). | `moderator:manage:banned_users` |
| unban user | Removes a ban or timeout from a user in a channel. | `moderator:manage:banned_users` |
| get banned users | Lists a channel's banned and timed-out users, optionally filtered to one user. | `moderation:read` |
| get moderators | Lists a channel's moderators, optionally filtered to one user. | `moderation:read` |
| add moderator | Gives a user moderator status in a channel. | `channel:manage:moderators` |
| remove moderator | Removes a user's moderator status in a channel. | `channel:manage:moderators` |
| get vips | Lists a channel's VIPs. | `channel:read:vips` |
| add vip | Gives a user VIP status in a channel. | `channel:manage:vips` |
| remove vip | Removes a user's VIP status in a channel. | `channel:manage:vips` |
| warn user | Issues a warning to a user that they must acknowledge before chatting again. | `moderator:manage:warnings` |
| get blocked terms | Lists the terms blocked in a channel's chat. | `moderator:read:blocked_terms` |
| add blocked term | Adds a blocked term to a channel; matching messages are held for review. | `moderator:manage:blocked_terms` |
| remove blocked term | Removes a blocked term from a channel's chat. | `moderator:manage:blocked_terms` |
| check automod status | Asks Twitch whether messages would be approved or held by AutoMod, without posting them. | `moderation:read` |
| create stream marker | Adds a marker to a live stream at the current position. The channel's stream must be live. The authenticated account must be the broadcaster. | `channel:manage:broadcast` |
| get stream markers | Lists the stream markers of a channel, optionally limited to a single video. The authenticated account must be the channel owner. | `user:read:broadcast` |
| create clip | Creates a clip of a running stream. The stream must be live. The authenticated account must be the broadcaster. | `clips:edit` |
| get clips | Lists clips by broadcaster, by clip IDs, or by game. When Clip IDs is set the IDs are looked up directly; otherwise a Game selects clips for that category, falling back to the broadcaster's clips. No scope is required. | — |
| get videos | Lists videos by user or by video IDs, with optional type, period, sort and language filters. When Video IDs is set the IDs are looked up directly and the filters are ignored. No scope is required. | — |
| delete videos | Deletes one or more videos by ID. This cannot be undone. The authenticated account must be the broadcaster. | `channel:manage:videos` |
| get games | Looks up a single game/category by name or numeric ID and returns its details. | — |
| get top games | Lists the most viewed games/categories on Twitch right now. | — |
| search categories | Searches games/categories by a partial or exact query. | — |
| search channels | Searches channels by a partial or exact query, optionally limited to live channels. | — |
| start raid | Starts a raid from a live channel to another live channel. The authenticated account must be the raiding broadcaster. | `channel:manage:raids` |
| cancel raid | Cancels a raid the channel has started. The authenticated account must be the raiding broadcaster. | `channel:manage:raids` |
| get streams | Fetches a list of active Twitch streams based on your configuration parameters. | — |
| get custom rewards | Lists a channel's custom Channel Points rewards. | `channel:read:redemptions` |
| create custom reward | Creates a custom Channel Points reward. Only the fields you set are sent. | `channel:manage:redemptions` |
| update custom reward | Updates a custom Channel Points reward. Only the fields you set are sent. | `channel:manage:redemptions` |
| delete custom reward | Deletes a custom Channel Points reward. | `channel:manage:redemptions` |
| get redemptions | Lists redemptions of a custom Channel Points reward, newest first by default. | `channel:read:redemptions` |
| update redemption status | Marks one or more custom reward redemptions as fulfilled or canceled. | `channel:manage:redemptions` |
| get polls | Lists a channel's polls, most recent first, or fetches specific polls. | `channel:read:polls` |
| create poll | Creates a channel poll with 2 to 5 choices. | `channel:manage:polls` |
| end poll | Ends an active channel poll, optionally hiding the result from viewers. | `channel:manage:polls` |
| get predictions | Lists a channel's predictions, most recent first, or fetches specific predictions. | `channel:read:predictions` |
| create prediction | Creates a channel prediction with 2 to 10 outcomes. | `channel:manage:predictions` |
| end prediction | Ends a channel prediction by resolving it with a winning outcome or cancelling it. | `channel:manage:predictions` |
| get bits leaderboard | Gets the Bits leaderboard for a channel. Set Center on user to make sure one user appears with others ranked around them. | `bits:read` |
| get cheermotes | Lists the Bits cheermotes Twitch supports, including each tier's images. Leave Channel blank for global cheermotes, or set it to a channel to also include its custom cheermotes. | — |
| get subscriptions | Lists a channel's subscribers. Set User to check a single user instead, which returns that user's subscription if they have one. | `channel:read:subscriptions` |
| check user subscription | Checks whether a user is subscribed to a channel, using the authenticated user's token. Blank User defaults to the authenticated account. | `user:read:subscriptions` |
| get schedule | Gets a channel's streaming schedule as a list of segments. | — |
| create segment | Adds a segment to a channel's streaming schedule. Twitch requires startDate (in UTC) and timezone; duration defaults to 240 minutes and isRecurring to false. | `channel:manage:schedule` |
| update segment | Changes an existing schedule segment. Only the fields you fill in are sent; leave a field blank to keep its current value. | `channel:manage:schedule` |
| delete segment | Removes a segment from a channel's schedule. | `channel:manage:schedule` |
| get teams | Looks up a Twitch team by ID or name and returns its details and members. Twitch has no endpoint that lists every team, so supply an ID or name (a numeric msg.team is treated as an ID). | — |
| get goals | Gets a channel's active creator goals (follower and subscription targets). | `channel:read:goals` |
| get charity campaign | Gets the charity campaign a channel is currently running, or null when there is no active campaign. | `channel:read:charity` |
| get hype train | Gets Hype Train events for a channel. Twitch exposes no REST endpoint for the current Hype Train, so this returns the recorded events of the current or latest train (paginated), not a live snapshot. | `channel:read:hype_train` |
| send whisper | Sends a whisper from the authenticated account to another user. Twitch may silently drop whispers it considers abusive, so a success only means the request was accepted. | `user:manage:whispers` |
<!-- helix-nodes:end -->

### Adding a Helix node

A Helix node is a spec, not a file pair. Add an entry to the matching group file under
`src/twitch/helix/specs/` (for example `specs/chat.ts`), then run `npm run build`. The build generates
the runtime module and editor html, updates `package.json` and refreshes the catalogue above.

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
the factory walks the pages and sets `msg.pagination`/`msg.total`. If an editor cannot be generated
from the fields, `customHtml` is the escape hatch.

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
2. In the Twitch API config node, open the mock section, set **Mock Port** to the proxy
   port (8080) and **Mock User ID** to the broadcaster the mock should report. Leave the
   client id empty to use a mock-only client.
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
