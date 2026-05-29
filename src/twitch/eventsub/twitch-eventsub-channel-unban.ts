import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelUnbanNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelUnban');
    }
    mapEvent(event: any) {
      return {
        userId:               event.userId,
        userName:             event.userName,
        userDisplayName:      event.userDisplayName,
        broadcasterId:        event.broadcasterId,
        broadcasterName:      event.broadcasterName,
        broadcasterDisplayName: event.broadcasterDisplayName,
        moderatorId:          event.moderatorId,
        moderatorName:        event.moderatorName,
        moderatorDisplayName: event.moderatorDisplayName,
        rawEvent:             event,
      };
    }
  }
  RED.nodes.registerType('twitch-eventsub-channel-unban', TwitchEventsubChannelUnbanNode);
};
