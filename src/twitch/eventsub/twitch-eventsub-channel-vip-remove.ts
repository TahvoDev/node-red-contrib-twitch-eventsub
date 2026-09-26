// twitch-eventsub-channel-vip-remove.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelVipRemoveNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelVipRemove');
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

  RED.nodes.registerType('twitch-eventsub-channel-vip-remove', TwitchEventsubChannelVipRemoveNode);
};
