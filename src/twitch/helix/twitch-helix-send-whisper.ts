import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  firstDefined,
  requireScopes,
  resolveUserId,
  toStr,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixSendWhisperNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['user:manage:whispers']);

      const authId = authUserId(twitchConfig);

      const toValue = firstDefined(msg.to, msg.recipient, msg.user, nodeConfig.to);
      if (!toStr(toValue)) {
        throw new Error('A recipient is required — set msg.to or the node recipient');
      }
      const toUserId = await resolveUserId(apiClient, toValue);

      const message = toStr(
        firstDefined(
          typeof msg.payload === 'string' ? msg.payload : undefined,
          msg.message,
          msg.text,
          nodeConfig.message
        )
      );
      if (!message) {
        throw new Error('Whisper text is required — set msg.payload or the node message');
      }

      await apiClient.asUser(authId, (ctx: any) =>
        ctx.whispers.sendWhisper(authId, toUserId, message)
      );

      return { fromUserId: authId, toUserId, sent: true };
    });
  }

  (TwitchHelixSendWhisperNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-send-whisper', TwitchHelixSendWhisperNode as any);
};
