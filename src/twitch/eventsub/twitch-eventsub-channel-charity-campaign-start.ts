// twitch-eventsub-channel-charity-campaign-start.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelCharityCampaignStartNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelCharityCampaignStart');
    }

    mapEvent(e: any) {
      return {
        id:                     e.id,
        broadcasterId:          e.broadcasterId,
        broadcasterName:        e.broadcasterName,
        broadcasterDisplayName: e.broadcasterDisplayName,
        charityName:            e.charityName,
        charityDescription:     e.charityDescription,
        charityLogo:            e.charityLogo,
        charityWebsite:         e.charityWebsite,
        currentAmount:          e.currentAmount,
        targetAmount:           e.targetAmount,
        startDate:              e.startDate,
        rawEvent:               e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-charity-campaign-start', TwitchEventsubChannelCharityCampaignStartNode);
};
