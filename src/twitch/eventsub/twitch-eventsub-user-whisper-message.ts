// twitch-eventsub-user-whisper-message.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubUserWhisperMessageNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('userWhisperMessage');
    }

    mapEvent(e: any) {
      return {
        id:                    e.id,
        userId:                e.userId,
        userName:              e.userName,
        userDisplayName:       e.userDisplayName,
        senderUserId:          e.senderUserId,
        senderUserName:        e.senderUserName,
        senderUserDisplayName: e.senderUserDisplayName,
        messageText:           e.messageText,
        rawEvent:              e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-user-whisper-message', TwitchEventsubUserWhisperMessageNode);
};
