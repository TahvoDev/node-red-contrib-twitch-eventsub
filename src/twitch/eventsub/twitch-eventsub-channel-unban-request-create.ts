// twitch-eventsub-channel-unban-request-create.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelUnbanRequestCreateNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelUnbanRequestCreate');
    }

    mapEvent(e: any) {
      return {
        id:                     e.id,
        broadcasterId:          e.broadcasterId,
        broadcasterName:        e.broadcasterName,
        broadcasterDisplayName: e.broadcasterDisplayName,
        userId:                 e.userId,
        userName:               e.userName,
        userDisplayName:        e.userDisplayName,
        message:                e.message,
        creationDate:           e.creationDate,
        rawEvent:               e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-unban-request-create', TwitchEventsubChannelUnbanRequestCreateNode);
};
