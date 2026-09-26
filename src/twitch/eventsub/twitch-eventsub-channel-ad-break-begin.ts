// twitch-eventsub-channel-ad-break-begin.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelAdBreakBeginNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelAdBreakBegin');
    }

    mapEvent(e: any) {
      return {
        broadcasterId:          e.broadcasterId,
        broadcasterName:        e.broadcasterName,
        broadcasterDisplayName: e.broadcasterDisplayName,
        requesterId:            e.requesterId,
        requesterName:          e.requesterName,
        requesterDisplayName:   e.requesterDisplayName,
        durationSeconds:        e.durationSeconds,
        startDate:              e.startDate,
        isAutomatic:            e.isAutomatic,
        rawEvent:               e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-ad-break-begin', TwitchEventsubChannelAdBreakBeginNode);
};
