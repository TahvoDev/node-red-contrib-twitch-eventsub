# node-red-contrib-twitch-eventsub

Node-RED nodes for Twitch: EventSub events, the Helix REST API and chat over IRC,
sharing a single `twitch-api-config` account node.

> **AI-generated code.** This project is written and maintained with AI code
> generation, and is still in early development. Review the code before relying on
> it in production, and expect breaking changes between versions.

## Overview

The package gives a flow three ways to talk to Twitch, plus the account node they
all share:

- **EventSub** — one `twitch events` node covers every EventSub subscription:
  follows, subs and gift subs, channel point redeems, bits, cheers, raids, polls,
  predictions, hype trains, goals, charity, moderation, AutoMod, chat, warnings,
  whispers, stream online/offline and more. Pick the event in the node's
  **Event** dropdown (grouped by Twitch's own areas); the node emits the event
  payload, including the full raw event.
- **Helix API** — one `twitch api` node calls any of the bundled Helix endpoints.
  Pick the endpoint, and an action where one endpoint groups several verbs, and
  the node renders the matching fields. Endpoints are split into `core`,
  `extended` and `advanced` tiers so the palette and requested OAuth scopes stay
  manageable.
- **Twitch Chat (IRC)** — receive and send chat messages, run commands, moderate,
  announce, join and leave channels.

The `twitch events` and `twitch api` nodes share the `twitch` palette category;
the chat nodes live under a separate `twitch chat (irc)` category. Every node is
backed by one `twitch-api-config` account node, which holds the OAuth credentials
(real device-code login or the built-in mock) and owns the EventSub WebSocket and
chat connections.

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

Twitch's user, channel and broadcaster IDs are the same number, and a login resolves to the same id
however it is named. So every broadcaster field also reads `msg.channel`/`msg.channelId`, and every
user field also reads `msg.userId` — a `chat in` message, which carries `msg.channel` and `msg.user`,
maps straight into the Helix nodes without a function node.

Every node is forgiving about its input: a string, a number, a boolean, a Buffer, an array or null
is coerced or ignored, and anything missing falls back to the node's config field. `msg.payload` can
override a node's primary field, and each node also accepts the named overrides documented in its
help panel.

### Paging

List nodes have **Limit**, **Get all** and **Max** fields:

- **Limit** — rows fetched per Twitch request (Twitch caps a page at 100; the node clamps to 1–100).
- **Get all** — off: one request, one page. On: the node follows every page for you and returns one
  `msg.payload` array, so a flow never has to loop pagination by hand.
- **Max** — a safety ceiling on the total when **Get all** is on. Leave it blank for every row (up to
  the built-in ceiling of 50,000); set it lower to stop early.

Every list node sets `msg.pagination` (`{ cursor }`), `msg.total` when Twitch reports it, and
`msg.truncated: true` when **Get all** stopped at the ceiling with pages still remaining — the cursor
is there if you want to continue. Without **Get all**, feed `msg.pagination.cursor` back as
`msg.after` to fetch the next page yourself.

### Tiers

Helix nodes are grouped into three tiers so the palette stays small:

- **core** (default): the everyday read/write nodes — users, streams, channel info, chat, bans, clips.
- **extended**: moderators, VIPs, blocked terms, chat settings, Channel Points, polls, predictions,
  schedule, raids, ads, videos, stream markers.
- **advanced**: bits, subscriptions, schedule extras, teams, charity, hype train, goals, whispers,
  stream key, channel editors, games, search, drops, extensions and content classification labels.

Only endpoints in an enabled tier appear in the **Endpoint** picker. Enable more in your Node-RED `settings.js`:

```js
module.exports = {
    // ...
    twitchApi: {
        tiers: ['core', 'extended'],
    },
};
```

The default is `['core']`. The `twitch-api` node itself is always registered; a flow that selects an
endpoint from a disabled tier fails that message with `Endpoint "…" is in the … tier, which is not
enabled` rather than disappearing from the palette. OAuth scopes are always requested for every tier
in a single login, so enabling a tier never forces you to re-authenticate.

### The twitch-api node

There is one Helix node, **twitch api** (`twitch-api`), plus the **twitch-api-config** account node.
Pick an endpoint; the node renders that endpoint's fields, and when the endpoint groups several verbs,
its action dropdown. List endpoints add Limit / Get all / Max. `msg.endpoint` and `msg.action` override
the selection at runtime.

Every endpoint is an entry in one registry file, `src/twitch/helix/specs/index.ts` (with `fields.ts`
for shared field builders and `mappers.ts` for result shaping).

### Adding an endpoint

Add a `defineHelix({...})` entry to `src/twitch/helix/specs/index.ts`, then run `npm run build`; it
appears in the **twitch api** node's picker. No node, editor html or manifest entry is generated — the
one `twitch-api` node drives every registry entry.

A spec declares its `tier` (`core` | `extended` | `advanced`), `scopes`, `fields` and the twurple
call. Give a spec `actions` + `defaultAction` to group several verbs behind one endpoint's Action
dropdown; field names and message shapes stay constant across actions. Only enabled tiers appear in
the picker, which is what keeps the default list short.

```ts
defineHelix({
  type: 'twitch-helix-get-something',
  tier: 'core',
  label: 'get something',
  help: 'One line shown in the picker and help.',
  scopes: ['channel:read:something'],
  fields: [
    { name: 'broadcaster', label: 'Broadcaster', kind: 'user', optional: true, hint: 'blank = authenticated user' },
  ],
  // run only makes the twurple call; fields are already resolved and coerced
  run: ({ api, broadcasterId }) => api.channels.getSomething(broadcasterId),
  // map returns a plain serialisable object, never a twurple class instance
  map: (result) => ({ id: result.id, name: result.name }),
})
```

For a list endpoint add `paged: { limit: 20 }` instead of declaring `limit`/`all`/`allMax`: the core
adds those fields, walks the pages for **Get all** and sets `msg.pagination`/`msg.total`.

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
3. Generate the mock flow (one `twitch-eventsub` node per event, wired to a debug
   node) with `node test/e2e/make-flow.js`, then import it into Node-RED.
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
the mock images if they are missing, starts Node-RED against the Twitch CLI mock with a
flow generated from the EventSub registry, installs nothing into your normal Node-RED data
dir (everything is temporary) and fails if any generated event was rejected or never
delivered. It needs podman (preferred) or docker. That requirement is isolated to the
test: `npm install`, `npm run build` and `npm run check` work without a container engine.

`npm run test:e2e:helix` is the Helix counterpart: it deploys a flow of `twitch-api` nodes (one
per endpoint), reads the credentials the Twitch CLI mock generates, and asserts the mock received
the request each one is supposed to make. Same container-engine requirement.

## Security

Everything a Twitch node emits is **untrusted input**: chat text, EventSub
fields, Helix strings and any `msg.*` override. The nodes sanitize their own
outputs, but a downstream node can undo that if you are not careful.

**Never** pass raw chat text straight to:

- a **function node** that concatenates it into a command string or uses it to
  build code;
- `exec` / `child_process` / a shell;
- an unescaped **template** (no triple-brace / raw HTML rendering) or dashboard
  `innerHTML`;
- a URL built with string `+`.

Only `msg.payload` and the named convenience fields have passed the sanitizer.
`msg.twitch.raw`, `msg._raw` and the EventSub `rawEvent` field are the
untouched originals — escape them before any HTML/template sink.

Prefer the sanitized value (`msg.payload`) and the branded helpers in
`src/security/`, keep templates sourced only from node config. See
[SECURITY.md](SECURITY.md) for the full threat model and controls.

> **Chat command authorization.** The role checks on `twitch-chat-command`
> (`Mod only`, `Broadcaster only`, …) trust the `msg.isMod`/`msg.isBroadcaster`
> flags unless you set a **Connection** on the node. With a Connection the
> sender is re-checked against Twitch and a forged flag is ignored; without one
> the node logs a warning and the gating is unverified. Set the Connection for
> any command that triggers a destructive action.

## Adding a new event

All EventSub events live in `src/twitch/eventsub/eventsub-registry.ts`. Add one entry
there (type, label, description, Twurple `subscribe` call and the payload field
mapping) and run `npm run build`. The single `twitch-eventsub` node picks it up
automatically: `scripts/generate-eventsub-editor.js` inlines the registry into the
editor so the **Event** dropdown is built synchronously, and there is no per-event
node or `package.json` entry to generate.
`npm run check` runs the unit tests, which fail if the registry is malformed. The
field mapping supports a plain property name, a renamed property, a default value and a
`map` function for anything more complex.

`categoryFor` in the registry maps the event area to the dropdown group (the chat
events area is `chat events`). The single EventSub node ships one icon,
`src/icons/twitch-icon.svg`. The Twitch Chat nodes still generate a per-node icon from
the glyphs in `src/twitch/chat/twitch-chat-icons.ts`; to use a new glyph, run
`npm i --no-save bootstrap-icons`, add the name there, then run
`npx tsc && npm run collect-glyphs` to vendor its path into `src/icons/glyphs.json`.
`scripts/generate-chat-icons.js` renders them via `scripts/render-glyph-icon.js`.

## Credits

- Twitch EventSub for Node-RED: [xurei/node-red-contrib-twitch-eventsub](https://github.com/xurei/node-red-contrib-twitch-eventsub/tree/master)
- [Twurple](https://www.npmjs.com/package/@twurple/api)
- Icons: [Bootstrap Icons](https://icons.getbootstrap.com/) (MIT)
