# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Security
- **New `src/security/` sanitizer layer.** All external strings (Twitch IRC/EventSub
  payloads, Helix responses, node config, `msg.*` overrides, HTTP request bodies) now cross
  one reusable function, `sanitize(value, policy)` (or its named helpers): NFKC normalisation,
  removal of C0/C1 control characters, bidi overrides and zero-width characters, and a length
  cap. Branded types (`SafeChatText`, `SafeIrcLine`, `TwitchLogin`, `TwitchUserId`, …) make an
  unsanitized value a compile error at the known sinks.
- IRC output rejects CR/LF/NUL, caps at 500 code points, and neutralises a leading `/` so
  chat text cannot become a command. A leading `.` is left alone because it is the emote
  prefix (`.gg`, `.com`) on this transport. Outgoing chat is rate limited with a token
  reserved inside the wait loop, so concurrent sends cannot bypass it.
- **Chat command authorization is now verified.** Set a **Connection** on
  `twitch-chat-command` and its role gates re-check the sender against Twitch
  (`checkUserIsModerator`, `checkUserSubscription`, the VIP list); forged
  `msg.isMod`/`msg.isBroadcaster`/`msg.isSubscriber`/`msg.isVip` flags are ignored and the
  check fails closed. Without a Connection the node keeps the legacy flag-based gating and
  logs a warning — configure the Connection to close that gap.
- Strict runtime schema validation (`validateSchema`, no unknown keys) at the config, inbound
  `msg`, HTTP-body and payload boundaries, with a prototype-pollution guard. `Object.assign`
  of external data was replaced with `safeMerge`; IRCv3 tags use `safeParseTags` (a `Map`).
- Helix/HTTP URLs are built with `buildUrl` against a host/path allowlist; no URL is assembled
  by string concatenation.
- HTTP admin routes (`/auth/device`, `/auth/token`, `/helix/*`) now require Node-RED's
  built-in editor permissions (`flows.read` / `flows.write`), so a standard `adminAuth`
  config needs no changes, and enforce an 8 KB body cap (declared and actual size). Secrets
  are redacted from logs and all config-node status lines are sanitized centrally.
- `sanitizeDeep` drops a nested object past its depth limit instead of returning it raw, so
  a deeply nested payload cannot smuggle control/bidi characters through.
- EventSub webhook verification utilities (HMAC-SHA256 over `id + timestamp + rawBody` with
  `crypto.timingSafeEqual`, a 10-minute timestamp window and message-id dedupe) ship for a
  future HTTP receiver. The shipped transport is WebSocket, so nothing calls them yet.
- Editor UI builds form elements with `.text()`/`.attr()` instead of string-concatenated HTML.
- The raw escape hatches (`msg.twitch.raw`, `msg._raw`, EventSub `rawEvent`) are documented
  as unsanitized; only `msg.payload` and the named fields pass the sanitizer.
- Tooling: `tsc` runs with `noImplicitAny`; ESLint (`eslint-plugin-security`,
  `eslint-plugin-no-unsanitized`) and a forbidden-pattern sink check run in `npm run check`;
  the security tests enforce ≥90% line/function coverage as part of `npm run check`; `npm
  audit` is clean and `package-lock.json` is committed. `ci/github-actions.yml` wires the
  same checks plus CodeQL and Semgrep into GitHub Actions — copy it to
  `.github/workflows/ci.yml` (or push it with a token that has `workflows: write`) to
  activate it.

### Removed
- The `user authorization granted` and `user authorization revoked` events. Twitch only delivers those topics over webhooks and conduits, never over the EventSub WebSocket, so the nodes could never fire; they only sat in the Event dropdown with a "not available over WebSocket" warning. The unsupported-event handling that existed solely for them (`unsupportedReason` in the registry, `onUnsupportedCb`/`warnedUnsupported` in the service, `unsupportedNodes` in the config node) was removed with them.

### Changed
- **Message contract (additive).** Messages built from external data now carry
  `msg.twitch = { untrusted: true, source, raw, receivedAt }`. `twitch-chat-in` emits the
  sanitized text in `msg.payload`/`msg.text` and the original in `msg.twitch.raw`; the
  `twitch-eventsub` node sanitizes its convenience fields and mirrors the full event into
  `msg.twitch.raw`. Existing properties are unchanged, but flows that forward the whole
  message should treat `payload` as untrusted (see SECURITY.md).
- **Collapsed the Helix palette to one `twitch-api` node.** The per-endpoint nodes and the
  spec-to-node factory/build-generation are gone. Endpoints are registry entries under
  `src/twitch/helix/specs/`; a single hand-written `twitch-api` node (endpoint → action
  picker, dynamic fields) calls them through one shared path (`helix-core.ts`). Fewer nodes means no
  bulk generation: no generated `.js`/`.html` per endpoint, no `scopes.json`.
- Consolidated the Helix palette: endpoints that share a resource now sit behind an Action dropdown
  (`bans`, `moderators`, `vips`, `blocked terms`, `chat settings`, `channel points`, `redemptions`,
  `polls`, `predictions`, `schedule`, `raids`, `ads`, `stream markers`, `clips`, `videos`, `bits`,
  `subscriptions`, `teams`); the editor shows only the selected action's fields and scopes are
  checked per action. Palette clutter is handled by tiers.
- Every spec now declares a `tier` (`core` | `extended` | `advanced`). Only enabled tiers register;
  configure `twitchApi.tiers` in `settings.js` (default `['core']`). OAuth scopes stay the fixed
  build-time union, so changing tiers never forces users to re-authenticate.
- Helix calls always run as the authenticated account. Removed the actor overrides that could never
  work with a second account: the broadcaster context on *update channel info*, *ads* and *raids*,
  and the `From` / `User` overrides on *send shoutout* and *get followed channels* (those fields name
  the channel/target, not the actor). Public endpoints (emotes, chat badges, content classification
  labels, drops, extensions) still use an app token, deliberately without a user.
- The editor renders boolean fields with their label (e.g. **Get all**, **Include Email**) instead of
  an unlabelled checkbox.
- **Paging:** **Get all** now follows every page by default instead of stopping at a 1000-row cap, so
  flows no longer need a manual pagination loop. **Max** is a blank-by-default safety ceiling (hard
  limit 50000); when it is reached the node sets `msg.truncated: true` and leaves the cursor so a flow
  can continue if it really needs to.
- **Breaking (unreleased branch, no aliases kept):** the one-endpoint Helix types are renamed or
  removed. `ban-user`/`unban-user`/`get-banned-users` → `bans`; `create-clip`/`get-clips` → `clips`;
  `get-videos`/`delete-videos` → `videos`; `get-custom-rewards`/`create|update|delete-custom-reward`
  → `channel-points`; `get-redemptions`/`update-redemption-status` → `redemptions`;
  `get-polls`/`create-poll`/`end-poll` → `polls`; `get-predictions`/`create|end-prediction` →
  `predictions`; `get-schedule`/`create|update|delete-segment` → `schedule`;
  `start-raid`/`cancel-raid` → `raids`; `get-ad-schedule`/`snooze-next-ad`/`start-commercial` → `ads`;
  `create-stream-marker`/`get-stream-markers` → `stream-markers`;
  `get-moderators`/`add|remove-moderator` → `moderators`; `get-vips`/`add|remove-vip` → `vips`;
  `get-blocked-terms`/`add|remove-blocked-term` → `blocked-terms`;
  `get-chat-settings`/`update-chat-settings` → `chat-settings`;
  `get-bits-leaderboard`/`get-cheermotes` → `bits`;
  `get-subscriptions`/`check-user-subscription` → `subscriptions`;
  `get-teams`/`get-channel-teams` → `teams`. The remaining long-tail endpoints are ordinary registry
  entries too; the single `twitch-api` node runs them all.
- Helix endpoints are registry entries under `src/twitch/helix/specs/`: an entry declares its tier,
  scopes, fields and the twurple call, and the single `twitch-api` node runs it. Adding an
  endpoint is one entry, no other file.
- The config node's "Login with Twitch" button requests the union of the scopes declared by the
  registry, so it cannot drift from what the picker can call.
- Behaviour changes introduced by the migration, flagged here: `get-blocks` and `update-user-description`
  now check their required scopes (`user:read:blocked_users` / `user:edit`) before calling Twitch instead
  of relying on the API error, and an unrecognised `select` value falls back to the field default rather
  than failing

### Added
- More Helix coverage, all as the same declarative specs run by the one `twitch-api` node: AutoMod
  settings and held messages, Shield Mode, unban requests, moderated channels, ban/moderator checks,
  chat colour, user emotes, shared chat, followed streams, channel editors, charity donations,
  schedule iCal/vacation/single-segment, content classification labels, drops entitlements,
  extensions (released/live/bits/transactions) and user extensions. `modify channel information`
  also covers content classification labels, delay and branded content now
- A **Mock Token** field on the Twitch API config node's mock section. The Twitch CLI mock API
  generates a random client id, access token and user id at startup and 401s anything else, so the
  mock now accepts the token it prints (the Helix e2e reads all three from the mock log)
- Action support in the spec format (`actions`, `defaultAction`) with an Action dropdown, per-action
  fields and per-action scope checks; `msg.action` → node config → `defaultAction` resolution
- `test/e2e/run-helix-e2e.js`: runs the built module in a Node-RED container against the Twitch CLI
  mock, deploys the `twitch-api` node at several endpoints and checks each reaches the mock API
- `test/unit/helix-nodes.test.js` covers the dispatcher, paging, actions, aliases and tier gating
- Helix endpoints in the `twitch-api` endpoint picker for engagement and monetisation:
  channel points (`get/create/update/delete custom reward`, `get redemptions`,
  `update redemption status`), polls (`get/create/end poll`), predictions
  (`get/create/end prediction`), `get bits leaderboard`, `get cheermotes`,
  `get subscriptions`, `check user subscription`, schedule (`get schedule`,
  `create/update/delete segment`), `get teams`, `get channel teams`, `get goals`,
  `get charity campaign`, `get hype train` and `send whisper`
- Helix endpoints in the `twitch-api` endpoint picker for streams, clips and content:
  `create stream marker`, `get stream markers`, `get stream key`, `create clip`, `get clips`,
  `get videos`, `delete videos`, `get games`, `get top games`, `search categories`,
  `search channels`, `start raid`, `cancel raid`, `start commercial`, `get ad schedule` and
  `snooze next ad`
- Helix endpoints in the `twitch-api` endpoint picker for moderation: `ban user` (with an
  optional timeout duration), `unban user`, `get banned users`, `get moderators`, `add moderator`,
  `remove moderator`, `get vips`, `add vip`, `remove vip`, `warn user`, `get blocked terms`,
  `add blocked term`, `remove blocked term` and `check automod status`
- Helix endpoints in the `twitch-api` endpoint picker for channel & chat: `get channel info`,
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
- The config node requests the scopes the new nodes need (including
  `channel:manage:broadcast`, `channel:manage:polls`, `channel:manage:predictions`,
  `channel:manage:redemptions`, `channel:manage:schedule`, `channel:manage:videos`,
  `channel:manage:raids`, `channel:manage:moderators`, `channel:manage:vips`,
  `channel:edit:commercial`, `channel:manage:ads`, `channel:read:stream_key`, `clips:edit`,
  `moderator:read:chatters`, `moderator:manage:chat_settings`, `moderator:manage:shoutouts`,
  `moderator:manage:warnings`, `user:write:chat`, `user:read:follows`,
  `user:read:subscriptions`, `user:manage:whispers`) in one login
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
- The Twitch Chat connection no longer hangs on `Connecting...` when the account's auth fails. An auth error (for example an invalid refresh token) now sets a red `Auth failed` status on the connection and on every chat node instead of being logged and leaving the nodes waiting forever
- Event node icons fell back to the default Node-RED arrow because they lived outside the `icons` directory Node-RED scans for the package
- The combined event nodes only ever emitted their last registered event, and their `eventType` field was always `unknown`
- The hype train node never appeared in the palette: its editor file was a copy of the poll node's and registered the wrong type
- `package.json` pointed `main` at an `index.js` that did not exist, so the module could not be loaded by name (for example by Node-RED's external modules) even though the palette loaded from the `node-red` field
- EventSub subscriptions are restored when Twitch reopens the WebSocket connection. Twurple reports the disconnect but does not resubscribe, so the nodes used to stay connected while silently receiving nothing
- A subscription that cannot be restored is now retried instead of throwing an uncaught exception that stopped the whole Node-RED runtime
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
