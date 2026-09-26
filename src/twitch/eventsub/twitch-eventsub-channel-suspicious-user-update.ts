// twitch-eventsub-channel-suspicious-user-update.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelSuspiciousUserUpdateNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelSuspiciousUserUpdate');
    }

    mapEvent(e: any) {
      return {
        broadcasterId:          e.broadcasterId,
        broadcasterName:        e.broadcasterName,
        broadcasterDisplayName: e.broadcasterDisplayName,
        moderatorId:            e.moderatorId,
        moderatorName:          e.moderatorName,
        moderatorDisplayName:   e.moderatorDisplayName,
        userId:                 e.userId,
        userName:               e.userName,
        userDisplayName:        e.userDisplayName,
        lowTrustStatus:         e.lowTrustStatus,
        rawEvent:               e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-suspicious-user-update', TwitchEventsubChannelSuspiciousUserUpdateNode);
};
