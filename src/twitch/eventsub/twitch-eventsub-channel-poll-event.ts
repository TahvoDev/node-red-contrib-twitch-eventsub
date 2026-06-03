import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelPollEventNode extends BaseTwitchEventsubNode {
    private selectedEventType: string;

    constructor(config: any) {
      super(RED, config);

      this.selectedEventType = config.eventType ?? 'all';

      // Register all three poll-related EventSub hook targets
      this.register('channelPollBegin');
      this.register('channelPollProgress');
      this.register('channelPollEnd');
    }

    mapEvent(e: any, type?: string) {
      let resolvedType = 'unknown';
      if (type) {
        resolvedType = type.replace('channelPoll', '').toLowerCase(); // 'begin', 'progress', or 'end'
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
        title:                  e.title,

        // Safely parse out the vote configuration metric tallies
        choices: e.choices?.map((c: any) => ({
          id:                 c.id,
          title:              c.title,
          votes:              c.votes ?? 0,
          channelPointsVotes: c.channelPointsVotes ?? 0,
          bitsVotes:          c.bitsVotes ?? 0,
        })) ?? [],

        bitsVoting:             e.bitsVoting ?? null,
        channelPointsVoting:    e.channelPointsVoting ?? null,
        status:                 e.status ?? null, // Populated on 'end'
        startDate:              e.startDate ?? null,
        endDate:                e.endDate ?? null, // Populated on 'end'
        rawEvent:               e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-poll-event', TwitchEventsubChannelPollEventNode);
};
