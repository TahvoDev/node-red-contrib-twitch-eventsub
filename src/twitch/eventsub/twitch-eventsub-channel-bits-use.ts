// twitch-eventsub-channel-bits-use.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelBitsUseNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelBitsUse');
    }

    mapEvent(e: any) {
      return {
        broadcasterId:          e.broadcasterId,
        broadcasterName:        e.broadcasterName,
        broadcasterDisplayName: e.broadcasterDisplayName,
        userId:                 e.userId,
        userName:               e.userName,
        userDisplayName:        e.userDisplayName,
        type:                   e.type,
        bits:                   e.bits,
        messageText:            e.messageText,
        messageParts:           e.messageParts,
        powerUp:                e.powerUp,
        rawEvent:               e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-bits-use', TwitchEventsubChannelBitsUseNode);
};
