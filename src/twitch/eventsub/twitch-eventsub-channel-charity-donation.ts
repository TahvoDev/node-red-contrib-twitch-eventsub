// twitch-eventsub-channel-charity-donation.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelCharityDonationNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelCharityDonation');
    }

    mapEvent(e: any) {
      return {
        campaignId:             e.campaignId,
        broadcasterId:          e.broadcasterId,
        broadcasterName:        e.broadcasterName,
        broadcasterDisplayName: e.broadcasterDisplayName,
        donorId:                e.donorId,
        donorName:              e.donorName,
        donorDisplayName:       e.donorDisplayName,
        charityName:            e.charityName,
        charityDescription:     e.charityDescription,
        charityLogo:            e.charityLogo,
        charityWebsite:         e.charityWebsite,
        amount:                 e.amount,
        rawEvent:               e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-charity-donation', TwitchEventsubChannelCharityDonationNode);
};
