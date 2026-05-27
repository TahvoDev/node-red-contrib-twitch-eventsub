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
        const apiClient = twitchConfig.apiClient;
        if (!apiClient) {
            done(new Error('Twitch API not ready yet'));
            return;
        }
        try {
            msg.payload = await handler(apiClient, msg, config);
            send(msg);
            done();
        } catch (err) {
            done(err);
        }
    });
}
