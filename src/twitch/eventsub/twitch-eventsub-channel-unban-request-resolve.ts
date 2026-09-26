// twitch-eventsub-channel-unban-request-resolve.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelUnbanRequestResolveNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelUnbanRequestResolve');
    }

    mapEvent(e: any) {
      return {
        id:                     e.id,
        broadcasterId:          e.broadcasterId,
        broadcasterName:        e.broadcasterName,
        broadcasterDisplayName: e.broadcasterDisplayName,
        moderatorId:            e.moderatorId,
        moderatorName:          e.moderatorName,
        moderatorDisplayName:   e.moderatorDisplayName,
        userId:                 e.userId,
        userName:               e.userName,
        userDisplayName:        e.userDisplayName,
        resolutionMessage:      e.resolutionMessage,
        status:                 e.status,
        rawEvent:               e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-unban-request-resolve', TwitchEventsubChannelUnbanRequestResolveNode);
};
