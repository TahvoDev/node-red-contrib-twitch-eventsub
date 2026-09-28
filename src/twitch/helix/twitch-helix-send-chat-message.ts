import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  firstDefined,
  mapSentMessage,
  requireScopes,
  resolveBroadcaster,
  toStr,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixSendChatMessageNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['user:write:chat']);

      const text = toStr(
        firstDefined(
          msg.message,
          typeof msg.payload === 'string' ? msg.payload : undefined,
          msg.text,
          nodeConfig.message
        )
      );
      if (!text) throw new Error('Message text is required — set msg.payload or the node message');

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const senderId = authUserId(twitchConfig);
      const replyTo = toStr(firstDefined(msg.replyTo, msg.replyParentMessageId));

      const sent = await apiClient.asUser(senderId, (ctx: any) =>
        ctx.chat.sendChatMessage(
          broadcasterId,
          text,
          replyTo ? { replyParentMessageId: replyTo } : undefined
        )
      );

      return mapSentMessage(sent);
    });
  }

  (TwitchHelixSendChatMessageNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-send-chat-message', TwitchHelixSendChatMessageNode as any);
};
