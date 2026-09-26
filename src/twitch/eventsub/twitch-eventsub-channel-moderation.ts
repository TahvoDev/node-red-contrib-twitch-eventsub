// twitch-eventsub-channel-moderation.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelModerationNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelModerate');
    }

    mapEvent(e: any) {
      return {
        moderationAction:       e.moderationAction, // 'ban', 'timeout', 'unban', 'clear', 'delete', 'raid', 'mod', 'vip', 'warn', ...
        broadcasterId:          e.broadcasterId,
        broadcasterName:        e.broadcasterName,
        broadcasterDisplayName: e.broadcasterDisplayName,
        moderatorId:            e.moderatorId,
        moderatorName:          e.moderatorName,
        moderatorDisplayName:   e.moderatorDisplayName,

        // Only present on actions that target a viewer
        userId:                 e.userId ?? null,
        userName:               e.userName ?? null,
        userDisplayName:        e.userDisplayName ?? null,

        // Only present on some of the actions
        reason:                 e.reason ?? null,
        expiryDate:             e.expiryDate ?? null, // timeout only
        messageId:              e.messageId ?? null, // delete only
        messageText:            e.messageText ?? null, // delete only
        viewerCount:            e.viewerCount ?? null, // raid only
        followDurationMinutes:  e.followDurationMinutes ?? null, // followers mode only
        waitTimeSeconds:        e.waitTimeSeconds ?? null, // slow mode only
        moderatorMessage:       e.moderatorMessage ?? null, // unban request only
        isApproved:             e.isApproved ?? null, // unban request only
        chatRulesCited:         e.chatRulesCited ?? [], // warn only
        terms:                  e.terms ?? [], // automod terms only
        fromAutoMod:            e.fromAutoMod ?? null, // automod terms only

        rawEvent:               e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-moderation', TwitchEventsubChannelModerationNode);
};
