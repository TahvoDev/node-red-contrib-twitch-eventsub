# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- 52 new event nodes covering goals, moderation, VIPs, warnings, unban requests, suspicious users, chat clearing/holds/settings, AutoMod, shared chat, subscription end, channel rewards, redemption update, automatic reward redemption, Hype Train v2, charity, bits use, ad breaks, whispers and user updates
- Every event is now its own node, so a flow wires a switch on the event you actually want
- Optional mock mode on the Twitch API config node: point `mock server port` at a local [Twitch CLI](https://dev.twitch.tv/docs/cli/) mock and the nodes subscribe and receive events without a real Twitch account or app
- `examples/mock-all-nodes.json`, a flow with every event node wired to a debug node
- `scripts/mock/fire-all-events.js`, which fires every event the Twitch CLI can generate and reports what the mock delivered and what the client rejected

### Changed
- **Breaking:** the combined `poll events`, `prediction events` and `hype train events` nodes are replaced by one node per event (`poll begin`/`poll progress`/`poll end`, `prediction begin`/`progress`/`lock`/`end`, `hype train begin`/`progress`/`end`). The `eventType` dropdown is gone, re-add the nodes to existing flows.

### Fixed
- The combined event nodes only ever emitted their last registered event, and their `eventType` field was always `unknown`
- The hype train node never appeared in the palette: its editor file was a copy of the poll node's and registered the wrong type
- `package.json` pointed `main` at an `index.js` that did not exist, so the module could not be loaded by name (for example by Node-RED's external modules) even though the palette loaded from the `node-red` field
- EventSub subscriptions are restored when Twitch reopens the WebSocket connection. Twurple reports the disconnect but does not resubscribe, so the nodes used to stay connected while silently receiving nothing
- A subscription that cannot be restored is now retried instead of throwing an uncaught exception that stopped the whole Node-RED runtime

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
