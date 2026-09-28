# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- Helix API nodes under the `twitch api` palette category for streams, clips and content:
  `create stream marker`, `get stream markers`, `get stream key`, `create clip`, `get clips`,
  `get videos`, `delete videos`, `get games`, `get top games`, `search categories`,
  `search channels`, `start raid`, `cancel raid`, `start commercial`, `get ad schedule` and
  `snooze next ad`
- Helix API nodes under the `twitch api` palette category for moderation: `ban user` (with an
  optional timeout duration), `unban user`, `get banned users`, `get moderators`, `add moderator`,
  `remove moderator`, `get vips`, `add vip`, `remove vip`, `warn user`, `get blocked terms`,
  `add blocked term`, `remove blocked term` and `check automod status`
- Helix API nodes under the `twitch api` palette category for channel & chat: `get channel info`,
  `update channel info`, `send chat message`, `send announcement`, `send shoutout`, `get chatters`,
  `get chat settings`, `update chat settings`, `clear chat`, `delete chat message`, `get emotes`,
  `get chat badges`, `get followers` and `get followed channels`.
  They accept a username or an ID (resolved automatically), default the broadcaster to the
  authenticated account, coerce string/number/boolean/Buffer/array/null input, document every
  `msg` override and set `msg.pagination`/`msg.total` on paged results
- `twitch-helix-utils.ts`: shared coercion, id/game resolution, scope checks, paging, error mapping
  and plain-object mappers, so every Helix node behaves and outputs the same way
- `twitch-helix-base.ts` now passes the resolved config node to handlers and merges a handler's
  `{ payload, extra }` result onto the message; existing nodes are unchanged
- The config node requests the scopes the new nodes need (`channel:manage:broadcast`,
  `channel:manage:moderators`, `channel:manage:vips`, `moderator:read:chatters`,
  `moderator:manage:chat_settings`, `moderator:manage:shoutouts`, `moderator:manage:warnings`,
  `user:write:chat`, `user:read:follows`) in one login
- `examples/helix-channel-chat.json` and a `test/unit/helix-nodes.test.js` unit test
- 52 new event nodes covering goals, moderation, VIPs, warnings, unban requests, suspicious users, chat clearing/holds/settings, AutoMod, shared chat, subscription end, channel rewards, redemption update, automatic reward redemption, Hype Train v2, charity, bits use, ad breaks, whispers and user updates
- Every event is now its own node, so a flow wires a switch on the event you actually want
- Optional mock mode on the Twitch API config node: point `mock server port` at a local [Twitch CLI](https://dev.twitch.tv/docs/cli/) mock and the nodes subscribe and receive events without a real Twitch account or app
- `examples/mock-all-nodes.json`, a flow with every event node wired to a debug node
- `test/e2e/fire-all-events.js`, which fires every event the Twitch CLI can generate and reports what the mock delivered and what the client rejected
- `npm run test:e2e`, which runs the built module in a real Node-RED container against the Twitch CLI mock and fails if any generated event was rejected or never delivered. It needs podman or docker; the regular build and install do not
- Each EventSub node now has its own palette icon: the event's glyph from Bootstrap Icons (MIT), rendered white on Node-RED's standard icon canvas at build time
- The EventSub palette is grouped into `twitch ...` categories that follow Twitch's EventSub areas (automod, chat events, channel points, subscriptions, moderation, polls, predictions, hype train, goals, charity, raids, bits & ads, stream, user)
- Twitch Chat (IRC) nodes under a `twitch chat (irc)` palette category: `twitch-chat-connection` (a shared connection that borrows the token from a `twitch-api-config`), `chat in`, `chat send`, `chat reply`, `chat command`, `chat ban`, `chat timeout`, `chat unban`, `chat delete message`, `chat announce`, `chat clear`, `chat join` and `chat part`
- Each Twitch Chat node has its own icon and uses the same palette colour as the EventSub nodes; the glyphs live in `src/twitch/chat/twitch-chat-icons.ts` and are rendered by `scripts/generate-chat-icons.js`
- `npm run check` also asserts the Twitch Chat message-property rules (announcement colour, channel normalisation, user id resolution), so a change to one chat node cannot quietly break the node it is wired to

### Changed
- Moved the test-only tooling under `test/`: the unit test to `test/unit/`, the e2e runner, event firer and mock images to `test/e2e/`, and the mock proxy to `test/mock/`. `scripts/` now holds build tooling only. No behaviour change
- The Twitch Chat connection node no longer has a **Bot** checkbox. It always identifies as a bot so Twitch applies its bot rate limits instead of the tighter anonymous-user ones. Existing connections keep working; the field is simply ignored if a saved config still carries it
- **Breaking:** the combined `poll events`, `prediction events` and `hype train events` nodes are replaced by one node per event (`poll begin`/`poll progress`/`poll end`, `prediction begin`/`progress`/`lock`/`end`, `hype train begin`/`progress`/`end`). The `eventType` dropdown is gone, re-add the nodes to existing flows.
- **Breaking:** the duplicate `-v2` nodes were merged into a single node per event that always uses the latest EventSub subscription version. `automod message hold`, `automod message update`, `auto redeem` and the three Hype Train nodes now use their V2 subscriptions (Hype Train V1 is deprecated by Twitch; AutoMod and automatic reward redemption V2 have different payloads, so use the `rawEvent` field for anything the mapped fields do not cover). Re-add any `-v2` nodes in existing flows under the same name without the suffix.
- Event nodes are now data-driven: every event is one entry in `src/twitch/eventsub/eventsub-registry.ts` and the runtime node, editor HTML and per-type Node-RED modules are generated at build time. Adding an event is one registry entry instead of a pair of hand-written files plus a `package.json` edit, and the build fails if the `package.json` node manifest drifts from the registry.
- The per-subscription retry after a WebSocket reconnect now backs off exponentially (capped) instead of retrying on a fixed delay.

### Fixed
- Event node icons fell back to the default Node-RED arrow because they lived outside the `icons` directory Node-RED scans for the package
- The combined event nodes only ever emitted their last registered event, and their `eventType` field was always `unknown`
- The hype train node never appeared in the palette: its editor file was a copy of the poll node's and registered the wrong type
- `package.json` pointed `main` at an `index.js` that did not exist, so the module could not be loaded by name (for example by Node-RED's external modules) even though the palette loaded from the `node-red` field
- EventSub subscriptions are restored when Twitch reopens the WebSocket connection. Twurple reports the disconnect but does not resubscribe, so the nodes used to stay connected while silently receiving nothing
- A subscription that cannot be restored is now retried instead of throwing an uncaught exception that stopped the whole Node-RED runtime
- The `user authorization granted` and `user authorization revoked` nodes no longer fail with a permanent error: Twitch only delivers those topics over webhooks and conduits, never over the EventSub WebSocket, so they are reported once as unsupported and the node says so instead of retrying
- The config node status no longer reads `Logged in as ` (empty login) in mock mode; it shows the mock user id and port
- `chat announce` no longer fails with `Invalid announcement color` when it is wired straight onto a `chat in` message: `msg.color` is the sender's chat colour there, not one of Twitch's five announcement colours, so the announcement now falls back to `primary`. Set `msg.announceColor` to pick a colour
- `chat reply` and `chat delete message` rejected every message coming from `chat in`, because they asked for `msg.replyTo` and `msg.messageId` while `chat in` emits `msg.id`. Both accept `msg.id` now, so the two can be wired directly onto a chat message
- `chat send` ignored `msg.text` and sent an empty message when a message had no payload, where `chat command` already accepted either. It reads `msg.text` as a fallback and reports an error on empty text instead of calling the API

## [0.1.1] - 2024-10-21
### Added
- Added example in NPM repository, no change in the code

## [0.1.0] - 2024-09-16
### Added
- Event: streamOnline, streamOffline
- Event: chatMessage

### Changed
- The legacy events now have a `rawEvent` field, which will be the default on new ones
- Improved the disconnection flow

### Fixed
- Fixed Raid event handler returning the raided display name instead of the raiding display name

## [0.0.2] - 2024-05-13
### Added
- Graceful unsubscribe when quitting/redeploying
- Status string
### Changed 
- Twurple updated to `7.1.0` ([Changelog](https://github.com/twurple/twurple/releases/tag/v7.1.0))
- Logging through nodes instead of a direct `console.log`

## [0.0.1] - 2024-02-29
### Added
- First release
- "follow" event
- "subscribe" event
- "subscribeGift" event
- "bits" event
- "redeem" event
- "raid" event
