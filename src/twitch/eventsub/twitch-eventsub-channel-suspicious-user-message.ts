// twitch-eventsub-channel-suspicious-user-message.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelSuspiciousUserMessageNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelSuspiciousUserMessage');
    }

    mapEvent(e: any) {
      return {
        broadcasterId:          e.broadcasterId,
        broadcasterName:        e.broadcasterName,
        broadcasterDisplayName: e.broadcasterDisplayName,
        userId:                 e.userId,
        userName:               e.userName,
        userDisplayName:        e.userDisplayName,
        lowTrustStatus:         e.lowTrustStatus,
        sharedBanChannelIds:    e.sharedBanChannelIds,
        types:                  e.types,
        banEvasionEvaluation:   e.banEvasionEvaluation,
        messageId:              e.messageId,
        messageText:            e.messageText,
        messageParts:           e.messageParts,
        rawEvent:               e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-suspicious-user-message', TwitchEventsubChannelSuspiciousUserMessageNode);
};
