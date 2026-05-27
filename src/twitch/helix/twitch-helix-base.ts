import type { NodeAPI } from 'node-red';

type HelixHandler = (apiClient: any, msg: any, config: any) => Promise<any>;

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

            msg.payload = await handler(apiClient, msg, config);
            node.status({});
            send(msg);
            done();
        } catch (err) {
            node.status({ fill: 'red', shape: 'ring', text: (err as Error).message });
            done(err);
        }
    });
}
