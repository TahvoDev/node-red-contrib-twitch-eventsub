import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  firstDefined,
  requireScopes,
  resolveUserId,
  toStr,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixSendShoutoutNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['moderator:manage:shoutouts']);

      const fromValue = firstDefined(
        msg.from,
        nodeConfig.fromBroadcaster,
        twitchConfig?.config?.twitch_user_id,
        twitchConfig?.userId
      );
      const fromId = await resolveUserId(apiClient, fromValue);

      const toValue = firstDefined(msg.to, nodeConfig.toBroadcaster);
      if (!toValue) throw new Error('Target broadcaster is required — set msg.to or the node field');
      const toId = await resolveUserId(apiClient, toValue);

      const toUser = await apiClient.users.getUserById(toId);

      await apiClient.asUser(fromId, (ctx: any) => ctx.chat.shoutoutUser(fromId, toId));

      return {
        fromBroadcasterId: fromId,
        toBroadcasterId: toId,
        toBroadcasterName: toUser?.name ?? toStr(toValue) ?? null,
      };
    });
  }

  (TwitchHelixSendShoutoutNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-send-shoutout', TwitchHelixSendShoutoutNode as any);
};
