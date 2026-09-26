// twitch-eventsub-automod-message-update-v2.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubAutomodMessageUpdateV2Node extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('autoModMessageUpdateV2');
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
        messageId:              e.messageId,
        messageText:            e.messageText,
        messageParts:           e.messageParts,
        reason:                 e.reason,
        autoMod:                e.autoMod,
        blockedTerms:           e.blockedTerms,
        status:                 e.status,
        holdDate:               e.holdDate,
        rawEvent:               e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-automod-message-update-v2', TwitchEventsubAutomodMessageUpdateV2Node);
};
