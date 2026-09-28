import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import { firstDefined, requireScopes, resolveBroadcaster, toInt } from './twitch-helix-utils';

const VALID_COMMERCIAL_LENGTHS = [30, 60, 90, 120, 150, 180];

module.exports = function (RED: NodeAPI) {
  function TwitchHelixStartCommercialNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:edit:commercial']);

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const length = toInt(
        firstDefined(msg.length, msg.commercialLength, msg.payload, nodeConfig.length),
        30
      ) ?? 30;
      if (VALID_COMMERCIAL_LENGTHS.indexOf(length) === -1) {
        throw new Error(
          `Commercial length must be one of ${VALID_COMMERCIAL_LENGTHS.join(', ')} seconds`
        );
      }

      await apiClient.asUser(broadcasterId, (ctx: any) =>
        ctx.channels.startChannelCommercial(broadcasterId, length)
      );

      return { broadcasterId, length, started: true };
    });
  }

  (TwitchHelixStartCommercialNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-start-commercial', TwitchHelixStartCommercialNode as any);
};
