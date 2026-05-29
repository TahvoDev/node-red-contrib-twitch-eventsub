import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelUpdateNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelUpdate');
    }
    mapEvent(event: any) {
      return {
        broadcasterId:        event.broadcasterId,
        broadcasterName:      event.broadcasterName,
        broadcasterDisplayName: event.broadcasterDisplayName,
        title:                event.streamTitle,
        categoryId:           event.categoryId,
        categoryName:         event.categoryName,
        isMature:             event.isMature,
        rawEvent:             event,
      };
    }
  }
  RED.nodes.registerType('twitch-eventsub-channel-update', TwitchEventsubChannelUpdateNode);
};
