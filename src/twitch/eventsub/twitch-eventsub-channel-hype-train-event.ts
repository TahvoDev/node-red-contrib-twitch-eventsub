import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelHypeTrainEventNode extends BaseTwitchEventsubNode {
    private selectedEventType: string;

    constructor(config: any) {
      super(RED, config);

      this.selectedEventType = config.eventType ?? 'all';

      // Register all three hype train EventSub webhook targets
      this.register('channelHypeTrainBegin');
      this.register('channelHypeTrainProgress');
      this.register('channelHypeTrainEnd');
    }

    mapEvent(e: any, type?: string) {
      let resolvedType = 'unknown';
      if (type) {
        resolvedType = type.replace('channelHypeTrain', '').toLowerCase(); // 'begin', 'progress', or 'end'
      }

      // Drop the output if it doesn't match the dropdown selection filter
      if (this.selectedEventType !== 'all' && this.selectedEventType !== resolvedType) {
        return null;
      }

      return {
        eventType:              resolvedType,
        id:                     e.id,
        broadcasterId:          e.broadcasterId,
        broadcasterName:        e.broadcasterName,
        broadcasterDisplayName: e.broadcasterDisplayName,
        level:                  e.level,
        total:                  e.total,
        progress:               e.progress,
        goal:                   e.goal,

        // Map the contributors list cleanly
        topContributions: e.topContributions?.map((c: any) => ({
          userId:      c.userId,
          userName:    c.userName,
          userDisplayName: c.userDisplayName,
          type:        c.type, // 'bits' or 'subscription'
          total:       c.total,
        })) ?? [],

        lastContribution: e.lastContribution ? {
          userId:      e.lastContribution.userId,
          userName:    e.lastContribution.userName,
          userDisplayName: e.lastContribution.userDisplayName,
          type:        e.lastContribution.type,
          total:       e.lastContribution.total,
        } : null,

        startDate:              e.startDate ?? null,
        endDate:                e.endDate ?? null, // Populated on 'end'
        cooldownEndDate:        e.cooldownEndDate ?? null, // Populated on 'end'
        rawEvent:               e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-hypetrain-event', TwitchEventsubChannelHypeTrainEventNode);
};
