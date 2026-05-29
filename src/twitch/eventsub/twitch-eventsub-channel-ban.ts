import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelBanNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelBan');
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
        reason:               event.reason,
        isPermanent:          event.isPermanent,
        startDate:            event.startDate,
        endDate:              event.endDate ?? null,
        rawEvent:             event,
      };
    }
  }
  RED.nodes.registerType('twitch-eventsub-channel-ban', TwitchEventsubChannelBanNode);
};
