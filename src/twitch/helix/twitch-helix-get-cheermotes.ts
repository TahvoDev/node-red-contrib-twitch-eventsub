import type { NodeAPI } from 'node-red';
import { getRawData } from '@twurple/common';
import { createHelixNode } from './twitch-helix-base';
import { firstDefined, requireScopes, resolveUserId, toStr } from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetCheermotesNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, []);

      const value = firstDefined(
        msg.broadcaster,
        msg.broadcasterId,
        typeof msg.payload === 'string' ? msg.payload : undefined,
        nodeConfig.broadcaster
      );
      const broadcasterId = toStr(value) ? await resolveUserId(apiClient, value) : undefined;

      const list = await apiClient.bits.getCheermotes(broadcasterId);
      const raw = getRawData(list) as Record<string, any>;

      const payload = Object.keys(raw).map((prefix) => {
        const cheermote = raw[prefix];
        return {
          prefix: cheermote.prefix ?? prefix,
          type: cheermote.type,
          order: cheermote.order,
          lastUpdated: cheermote.last_updated ?? null,
          tiers: (cheermote.tiers ?? []).map((tier: any) => ({
            minBits: tier.min_bits,
            id: tier.id,
            color: tier.color,
            canCheer: tier.can_cheer,
            showInBitsCard: tier.show_in_bits_card,
            images: tier.images,
          })),
        };
      });

      return {
        payload,
        extra: { pagination: { cursor: null }, total: payload.length },
      };
    });
  }

  (TwitchHelixGetCheermotesNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-cheermotes', TwitchHelixGetCheermotesNode as any);
};
