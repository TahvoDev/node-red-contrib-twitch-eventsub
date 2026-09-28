import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  firstDefined,
  requireScopes,
  resolveBroadcaster,
  toStr,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixCreateStreamMarkerNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:manage:broadcast']);

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const description = toStr(
        firstDefined(
          msg.description,
          typeof msg.payload === 'string' ? msg.payload : undefined,
          nodeConfig.description
        )
      );

      const marker = await apiClient.asUser(authUserId(twitchConfig), (ctx: any) =>
        ctx.streams.createStreamMarker(broadcasterId, description)
      );

      return mapMarker(marker);
    });
  }

  function mapMarker(marker: any) {
    return {
      id: marker.id,
      creationDate: marker.creationDate,
      description: marker.description ?? '',
      positionInSeconds: marker.positionInSeconds,
      url: marker.url ?? null,
      videoId: marker.videoId ?? null,
    };
  }

  (TwitchHelixCreateStreamMarkerNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-create-stream-marker', TwitchHelixCreateStreamMarkerNode as any);
};
