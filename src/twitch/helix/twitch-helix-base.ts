import type { NodeAPI } from 'node-red';
import { helixErrorMessage, shortStatus } from './twitch-helix-utils';

/**
 * A handler runs inside the base's try/catch. It may return:
 *  - a plain value: becomes msg.payload (existing nodes do this), or
 *  - `{ payload, extra }`: payload becomes msg.payload and extra is merged onto
 *    the message (new nodes use this to set msg.pagination / msg.total).
 *
 * The resolved config node is passed as the 4th argument so handlers do not
 * have to call RED.nodes.getNode(config.config) again.
 */
type HelixHandler = (
  apiClient: any,
  msg: any,
  config: any,
  twitchConfig: any
) => Promise<any>;

function applyResult(msg: any, result: any): void {
  if (
    result !== null &&
    typeof result === 'object' &&
    !Array.isArray(result) &&
    Object.prototype.hasOwnProperty.call(result, 'payload')
  ) {
    msg.payload = result.payload;
    if (result.extra && typeof result.extra === 'object') {
      Object.assign(msg, result.extra);
    }
    return;
  }
  msg.payload = result;
}

export function createHelixNode(RED: NodeAPI, node: any, config: any, handler: HelixHandler) {
    RED.nodes.createNode(node, config);

    const twitchConfig = RED.nodes.getNode(config.config) as any;
    if (!twitchConfig) {
        node.error('No Twitch Config node configured');
        return;
    }

    node.on('input', async (msg: any, send: any, done: any) => {
        node.status({ fill: 'blue', shape: 'dot', text: 'requesting...' });
        try {
            await twitchConfig.initAuth();

            const apiClient = twitchConfig.apiClient;
            if (!apiClient) {
                node.status({ fill: 'red', shape: 'ring', text: 'not authenticated' });
                done(new Error('Twitch API not ready — check config node credentials'));
                return;
            }

            // Mutate and forward the incoming message so no other property is dropped.
            applyResult(msg, await handler(apiClient, msg, config, twitchConfig));
            node.status({});
            send(msg);
            done();
        } catch (err) {
            // Only Twurple HTTP errors are rewritten; a handler's own Error keeps
            // its identity so existing nodes report exactly what they always did.
            if (typeof (err as any)?.statusCode === 'number') {
                const message = helixErrorMessage(err);
                node.status({ fill: 'red', shape: 'ring', text: shortStatus(message) });
                const wrapped = new Error(message);
                (wrapped as any).cause = err;
                done(wrapped);
                return;
            }

            node.status({
                fill: 'red',
                shape: 'ring',
                text: shortStatus((err as Error)?.message || String(err)),
            });
            done(err);
        }
    });
}
