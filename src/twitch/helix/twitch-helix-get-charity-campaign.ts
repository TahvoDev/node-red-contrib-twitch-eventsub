import type { NodeAPI } from 'node-red';
import { getRawData } from '@twurple/common';
import { createHelixNode } from './twitch-helix-base';
import { requireScopes, resolveBroadcaster } from './twitch-helix-utils';

function mapAmount(amount: any) {
  if (!amount) return null;
  return {
    value: amount.value,
    decimalPlaces: amount.decimalPlaces,
    localizedValue: amount.localizedValue,
    currency: amount.currency,
  };
}

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetCharityCampaignNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['channel:read:charity']);

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const campaign = await apiClient.charity.getCharityCampaign(broadcasterId);
      if (!getRawData(campaign)) return null;

      return {
        id: campaign.id,
        broadcasterId: campaign.broadcasterId,
        broadcasterName: campaign.broadcasterName,
        broadcasterDisplayName: campaign.broadcasterDisplayName,
        charityName: campaign.charityName,
        charityDescription: campaign.charityDescription,
        charityLogo: campaign.charityLogo,
        charityWebsite: campaign.charityWebsite,
        currentAmount: mapAmount(campaign.currentAmount),
        targetAmount: mapAmount(campaign.targetAmount),
      };
    });
  }

  (TwitchHelixGetCharityCampaignNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-charity-campaign', TwitchHelixGetCharityCampaignNode as any);
};
