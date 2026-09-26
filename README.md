Easy Node-RED Nodes for Twitch Creators 

This project is still in early development! 

### Features
- Adds nodes for Twitch events, such as follows, redeems, subs, stream online and more. 

### Testing without a Twitch account
The Twitch API config node has an optional mock mode, so a flow can be developed and
exercised against a local [Twitch CLI](https://dev.twitch.tv/docs/cli/) mock instead of a
real broadcaster account:

1. Start the mock. The API and the EventSub WebSocket server have to answer on the same
   port as far as the nodes are concerned, so they need to sit behind one proxy:
   ```sh
   twitch mock-api start --port 8081
   twitch event websocket start-server --port 8082 --require-subscription
   ```
2. In the Twitch API config node, open the mock section, set **Mock Port** to the port of
   the proxy and **Mock User ID** to the broadcaster the mock should report. Leave the
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

### Credits
Twitch EventSub for Node-RED [xurei/node-red-contrib-twitch-eventsub](https://github.com/xurei/node-red-contrib-twitch-eventsub/tree/master)
[Twurple](https://www.npmjs.com/package/@twurple/api).
