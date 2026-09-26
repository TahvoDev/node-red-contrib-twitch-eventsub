// twitch-eventsub-automod-settings-update.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubAutomodSettingsUpdateNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('autoModSettingsUpdate');
    }

    mapEvent(e: any) {
      return {
        broadcasterId:           e.broadcasterId,
        broadcasterName:         e.broadcasterName,
        broadcasterDisplayName:  e.broadcasterDisplayName,
        moderatorId:             e.moderatorId,
        moderatorName:           e.moderatorName,
        moderatorDisplayName:    e.moderatorDisplayName,
        overallLevel:            e.overallLevel,
        aggression:              e.aggression,
        bullying:                e.bullying,
        disability:              e.disability,
        misogyny:                e.misogyny,
        raceEthnicityOrReligion: e.raceEthnicityOrReligion,
        sexBasedTerms:           e.sexBasedTerms,
        sexualitySexOrGender:    e.sexualitySexOrGender,
        swearing:                e.swearing,
        rawEvent:                e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-automod-settings-update', TwitchEventsubAutomodSettingsUpdateNode);
};
