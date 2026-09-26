// twitch-eventsub-channel-hype-train-end.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubHypeTrainEndNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelHypeTrainEnd');
    }

    mapEvent(e: any) {
      return {
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

  RED.nodes.registerType('twitch-eventsub-channel-hype-train-end', TwitchEventsubHypeTrainEndNode);
};
