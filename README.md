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
