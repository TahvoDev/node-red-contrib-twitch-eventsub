// twitch-eventsub-user-authorization-grant.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubUserAuthorizationGrantNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('userAuthorizationGrant');
    }

    mapEvent(e: any) {
      return {
        userId:          e.userId,
        userName:        e.userName,
        userDisplayName: e.userDisplayName,
        clientId:        e.clientId,
        rawEvent:        e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-user-authorization-grant', TwitchEventsubUserAuthorizationGrantNode);
};
