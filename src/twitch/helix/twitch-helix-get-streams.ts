import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';

module.exports = function (RED: NodeAPI) {
    function TwitchHelixGetStreamsNode(this: any, config: any) {
        const node = this;

        createHelixNode(RED, node, config, async (apiClient, msg) => {
            node.status({ fill: 'blue', shape: 'dot', text: 'fetching streams...' });

            try {
                const filter: any = {};

                const userId = msg.userId ?? config.userId;
                if (userId) filter.userId = userId;

                const userName = msg.userName ?? config.userName;
                if (userName) filter.userName = userName;

                const game = msg.game ?? config.game;
                if (game) filter.game = game;

                const language = msg.language ?? config.language;
                if (language) filter.language = language;

                let streamType = msg.type ?? msg.streamType ?? config.streamType ?? 'all';

                if (streamType !== 'live' && streamType !== 'all') {
                    streamType = 'all';
                }
                filter.type = streamType;

                const limit = msg.limit ?? config.limit ?? 20;
                if (limit) filter.limit = Number(limit);

                if (msg.after) filter.after = msg.after;
                if (msg.before) filter.before = msg.before;

                const configNode = RED.nodes.getNode(config.config) as any;
                const authUserId = configNode?.config?.twitch_user_id;

                if (!authUserId) {
                    node.status({ fill: 'red', shape: 'ring', text: 'missing config' });
                    node.error('Twitch User ID not found in configuration. Please re-authenticate your config node.', msg);
                    return null;
                }

                const result = await apiClient.asUser(String(authUserId), async (ctx) => {
                    return await ctx.streams.getStreams(filter);
                });

                node.status({});

                return {
                    data: result.data.map(toPlainStream),
                        cursor: result.cursor ?? null,
                };

            } catch (error: any) {
                node.status({ fill: 'red', shape: 'dot', text: 'api error' });
                node.error(`Twitch API Error: ${error.message || error}`, msg);
                return null;
            }
        });
    }

    function toPlainStream(stream: any) {
        return {
            id: stream.id,
            userId: stream.userId,
            userName: stream.userName,
            userDisplayName: stream.userDisplayName,
            gameId: stream.gameId,
            gameName: stream.gameName,
            type: stream.type,
            title: stream.title,
            viewerCount: stream.viewers,
            startedAt: stream.startDate,
            language: stream.language,
            thumbnailUrl: stream.thumbnailUrl,
            isMature: stream.isMature,
        };
    }

    (TwitchHelixGetStreamsNode as any).icon = 'twitch-icon.svg';
    RED.nodes.registerType('twitch-helix-get-streams', TwitchHelixGetStreamsNode as any);
};
