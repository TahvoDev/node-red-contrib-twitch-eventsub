module.exports = function(RED: any) {
  class TwitchEventSubChannelChatMessageNode extends BaseTwitchEventsubNode {
    get subscriptionType() { return 'channelChatMessage'; }

    mapEvent(event: any) {
      return {
        messageId: event.messageId,
        messageText: event.messageText,
        messageParts: event.messageParts,
        messageType: event.messageType,
        chatterId: event.chatterId,
        chatterName: event.chatterName,
        chatterDisplayName: event.chatterDisplayName,
        color: event.color,
        badges: event.badges,
        broadcasterId: event.broadcasterId,
        broadcasterName: event.broadcasterName,
        broadcasterDisplayName: event.broadcasterDisplayName,
        isCheer: event.isCheer,
        bits: event.bits,
        isRedemption: event.isRedemption || false,
        isSourceOnly: event.isSourceOnly || false,
        parentMessageId: event.parentMessageId || null,
        parentMessageText: event.parentMessageText || null,
        parentMessageUserId: event.parentMessageUserId || null,
        parentMessageUserName: event.parentMessageUserName || null,
        parentMessageUserDisplayName: event.parentMessageUserDisplayName || null,
        rewardId: event.rewardId || null,
        sourceBadges: event.sourceBadges || null,
        sourceBroadcasterId: event.sourceBroadcasterId || null,
        sourceBroadcasterName: event.sourceBroadcasterName || null,
        sourceBroadcasterDisplayName: event.sourceBroadcasterDisplayName || null,
        sourceMessageId: event.sourceMessageId || null,
        threadMessageId: event.threadMessageId || null,
        threadMessageUserId: event.threadMessageUserId || null,
        threadMessageUserName: event.threadMessageUserName || null,
        threadMessageUserDisplayName: event.threadMessageUserDisplayName || null,
      };
    }
  }

  RED.nodes.registerType('twitch-eventsub-channel-chat-message', TwitchEventSubChannelChatMessageNode);
};
