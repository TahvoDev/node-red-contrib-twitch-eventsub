import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  requireScopes,
  resolveBroadcaster,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetStreamKeyNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:read:stream_key']);

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);

      const streamKey = await apiClient.asUser(authUserId(twitchConfig), (ctx: any) =>
        ctx.streams.getStreamKey(broadcasterId)
      );

      return { streamKey, broadcasterId };
    });
  }

  (TwitchHelixGetStreamKeyNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-stream-key', TwitchHelixGetStreamKeyNode as any);
};
