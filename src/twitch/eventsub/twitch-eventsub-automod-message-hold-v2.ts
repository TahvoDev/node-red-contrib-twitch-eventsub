// twitch-eventsub-automod-message-hold-v2.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubAutomodMessageHoldV2Node extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('autoModMessageHoldV2');
    }

    mapEvent(e: any) {
      return {
        broadcasterId:          e.broadcasterId,
        broadcasterName:        e.broadcasterName,
        broadcasterDisplayName: e.broadcasterDisplayName,
        userId:                 e.userId,
        userName:               e.userName,
        userDisplayName:        e.userDisplayName,
        messageId:              e.messageId,
        messageText:            e.messageText,
        messageParts:           e.messageParts,
        reason:                 e.reason,
        autoMod:                e.autoMod,
        blockedTerms:           e.blockedTerms,
        holdDate:               e.holdDate,
        rawEvent:               e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-automod-message-hold-v2', TwitchEventsubAutomodMessageHoldV2Node);
};
