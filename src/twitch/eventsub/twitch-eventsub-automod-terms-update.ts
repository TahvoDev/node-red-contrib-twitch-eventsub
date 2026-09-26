// twitch-eventsub-automod-terms-update.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubAutomodTermsUpdateNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('autoModTermsUpdate');
    }

    mapEvent(e: any) {
      return {
        broadcasterId:          e.broadcasterId,
        broadcasterName:        e.broadcasterName,
        broadcasterDisplayName: e.broadcasterDisplayName,
        moderatorId:            e.moderatorId,
        moderatorName:          e.moderatorName,
        moderatorDisplayName:   e.moderatorDisplayName,
        action:                 e.action,
        fromAutoMod:            e.fromAutoMod,
        terms:                  e.terms,
        rawEvent:               e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-automod-terms-update', TwitchEventsubAutomodTermsUpdateNode);
};
