import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import { authUserId, requireScopes, resolveBroadcaster } from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixClearChatNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['moderator:manage:chat_messages']);

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const moderatorId = authUserId(twitchConfig);

      await apiClient.asUser(moderatorId, (ctx: any) =>
        ctx.moderation.deleteChatMessages(broadcasterId)
      );

      return { broadcasterId, cleared: true };
    });
  }

  (TwitchHelixClearChatNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-clear-chat', TwitchHelixClearChatNode as any);
};
