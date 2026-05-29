import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelPredictionEventNode extends BaseTwitchEventsubNode {
    private selectedEventType: string;

    constructor(config: any) {
      super(RED, config);

      // Store the user configuration filter choice ('all', 'begin', 'progress', etc.)
      this.selectedEventType = config.eventType ?? 'all';

      // Register all core prediction webhooks to intercept events safely
      this.register('channelPredictionBegin');
      this.register('channelPredictionProgress');
      this.register('channelPredictionLock');
      this.register('channelPredictionEnd');
    }

    /**
     * Maps and filters runtime structural payloads cleanly.
     */
    mapEvent(e: any, type?: string) {
      let resolvedType = 'unknown';
      if (type) {
        resolvedType = type.replace('channelPrediction', '').toLowerCase(); // Normalizes to 'begin', 'progress', 'lock', or 'end'
      }

      // Filter: If the user selected a specific type, discard it if it doesn't match
      if (this.selectedEventType !== 'all' && this.selectedEventType !== resolvedType) {
        return null;
      }

      return {
        eventType:             resolvedType,
        id:                    e.id,
        broadcasterId:         e.broadcasterId,
        broadcasterName:       e.broadcasterName,
        broadcasterDisplayName:e.broadcasterDisplayName,
        title:                 e.title,
        status:                e.status ?? null,
        winningOutcomeId:      e.winningOutcomeId ?? null,

        outcomes: e.outcomes?.map((o: any) => ({
          id:            o.id,
          title:         o.title,
          color:         o.color,
          users:         o.users ?? 0,
          channelPoints: o.channelPoints ?? 0,
        })) ?? [],

        startDate:             e.startDate ?? null,
        lockDate:              e.lockDate ?? null,
        endDate:               e.endDate ?? null,
        rawEvent:              e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-prediction-event', TwitchEventsubChannelPredictionEventNode);
};
