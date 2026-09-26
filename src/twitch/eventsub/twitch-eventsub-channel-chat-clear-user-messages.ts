// twitch-eventsub-channel-chat-clear-user-messages.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelChatClearUserMessagesNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelChatClearUserMessages');
    }

    mapEvent(e: any) {
      return {
        userId:                 e.userId,
        userName:               e.userName,
        userDisplayName:        e.userDisplayName,
        broadcasterId:          e.broadcasterId,
        broadcasterName:        e.broadcasterName,
        broadcasterDisplayName: e.broadcasterDisplayName,
        rawEvent:               e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-chat-clear-user-messages', TwitchEventsubChannelChatClearUserMessagesNode);
};
