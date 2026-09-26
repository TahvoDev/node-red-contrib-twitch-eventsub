// twitch-eventsub-channel-chat-settings-update.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelChatSettingsUpdateNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelChatSettingsUpdate');
    }

    mapEvent(e: any) {
      return {
        broadcasterId:             e.broadcasterId,
        broadcasterName:           e.broadcasterName,
        broadcasterDisplayName:    e.broadcasterDisplayName,
        emoteOnlyModeEnabled:      e.emoteOnlyModeEnabled,
        followerOnlyModeEnabled:   e.followerOnlyModeEnabled,
        followerOnlyModeDelay:     e.followerOnlyModeDelay,
        slowModeEnabled:           e.slowModeEnabled,
        slowModeDelay:             e.slowModeDelay,
        subscriberOnlyModeEnabled: e.subscriberOnlyModeEnabled,
        uniqueChatModeEnabled:     e.uniqueChatModeEnabled,
        rawEvent:                  e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-chat-settings-update', TwitchEventsubChannelChatSettingsUpdateNode);
};
