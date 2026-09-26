// twitch-eventsub-user-update.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubUserUpdateNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('userUpdate');
    }

    mapEvent(e: any) {
      return {
        userId:              e.userId,
        userName:            e.userName,
        userDisplayName:     e.userDisplayName,
        userDescription:     e.userDescription,
        userEmail:           e.userEmail,
        userEmailIsVerified: e.userEmailIsVerified,
        rawEvent:            e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-user-update', TwitchEventsubUserUpdateNode);
};
