// twitch-eventsub-channel-charity-campaign-stop.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelCharityCampaignStopNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelCharityCampaignStop');
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
        endDate:                e.endDate,
        rawEvent:               e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-charity-campaign-stop', TwitchEventsubChannelCharityCampaignStopNode);
};
