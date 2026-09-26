// twitch-eventsub-channel-chat-notification.ts

import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
  class TwitchEventsubChannelChatNotificationNode extends BaseTwitchEventsubNode {
    constructor(config: any) {
      super(RED, config);
      this.register('channelChatNotification');
    }

    mapEvent(e: any) {
      return {
        type:                   e.type, // 'sub', 'resub', 'subgift', 'raid', 'unraid', 'announcement', 'charitydonation', ...
        broadcasterId:          e.broadcasterId,
        broadcasterName:        e.broadcasterName,
        broadcasterDisplayName: e.broadcasterDisplayName,
        chatterId:              e.chatterId,
        chatterName:            e.chatterName,
        chatterDisplayName:     e.chatterDisplayName,
        chatterIsAnonymous:     e.chatterIsAnonymous,
        messageId:              e.messageId,
        messageText:            e.messageText,
        messageParts:           e.messageParts,
        color:                  e.color,
        badges:                 e.badges,
        sourceBroadcasterId:        e.sourceBroadcasterId ?? null,
        sourceBroadcasterName:      e.sourceBroadcasterName ?? null,
        sourceBroadcasterDisplayName: e.sourceBroadcasterDisplayName ?? null,
        sourceMessageId:        e.sourceMessageId ?? null,
        sourceBadges:           e.sourceBadges ?? null,

        // Subscription notifications
        tier:                   e.tier ?? null,
        isPrime:                e.isPrime ?? null,
        durationMonths:         e.durationMonths ?? null,
        cumulativeMonths:       e.cumulativeMonths ?? null, // resub only
        streakMonths:           e.streakMonths ?? null, // resub only
        isGift:                 e.isGift ?? null, // resub only
        isGifterAnonymous:      e.isGifterAnonymous ?? null,
        gifterId:               e.gifterId ?? null,
        gifterName:             e.gifterName ?? null,
        gifterDisplayName:      e.gifterDisplayName ?? null,

        // Gift notifications
        recipientId:            e.recipientId ?? null,
        recipientName:          e.recipientName ?? null,
        recipientDisplayName:   e.recipientDisplayName ?? null,
        communityGiftId:        e.communityGiftId ?? null,
        cumulativeAmount:       e.cumulativeAmount ?? null,

        // Raid notifications
        raiderId:               e.raiderId ?? null,
        raiderName:             e.raiderName ?? null,
        raiderDisplayName:      e.raiderDisplayName ?? null,
        viewerCount:            e.viewerCount ?? null,
        raiderProfileImageUrl:  e.raiderProfileImageUrl ?? null,

        // Charity and bits badge notifications
        charityName:            e.charityName ?? null,
        amount:                 e.amount ?? null,
        newTier:                e.newTier ?? null,

        rawEvent:               e,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-chat-notification', TwitchEventsubChannelChatNotificationNode);
};
