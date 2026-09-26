// twitch-eventsub-channel-moderator-remove.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelModeratorRemoveNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelModeratorRemove');
    }

    mapEvent(e: any) {
      return {
        broadcasterId:          e.broadcasterId,
        broadcasterName:        e.broadcasterName,
        broadcasterDisplayName: e.broadcasterDisplayName,
        userId:                 e.userId,
        userName:               e.userName,
        userDisplayName:        e.userDisplayName,
        rawEvent:               e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-moderator-remove', TwitchEventsubChannelModeratorRemoveNode);
};
