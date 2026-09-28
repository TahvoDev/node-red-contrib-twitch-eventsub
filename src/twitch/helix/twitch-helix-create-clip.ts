import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  firstDefined,
  requireScopes,
  resolveBroadcaster,
  toBool,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixCreateClipNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['clips:edit']);

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const createAfterDelay =
        toBool(firstDefined(msg.createAfterDelay, nodeConfig.createAfterDelay), false) === true;

      const clipId = await apiClient.asUser(authUserId(twitchConfig), (ctx: any) =>
        ctx.clips.createClip({ channel: broadcasterId, createAfterDelay })
      );

      return { id: clipId, broadcasterId, createAfterDelay };
    });
  }

  (TwitchHelixCreateClipNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-create-clip', TwitchHelixCreateClipNode as any);
};
