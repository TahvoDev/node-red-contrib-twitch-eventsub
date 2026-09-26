// twitch-eventsub-channel-shield-mode-begin.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelShieldModeBeginNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelShieldModeBegin');
    }

    mapEvent(e: any) {
      return {
        broadcasterId:          e.broadcasterId,
        broadcasterName:        e.broadcasterName,
        broadcasterDisplayName: e.broadcasterDisplayName,
        moderatorId:            e.moderatorId,
        moderatorName:          e.moderatorName,
        moderatorDisplayName:   e.moderatorDisplayName,
        startDate:              e.startDate,
        rawEvent:               e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-shield-mode-begin', TwitchEventsubChannelShieldModeBeginNode);
};
