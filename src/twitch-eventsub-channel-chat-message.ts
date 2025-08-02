module.exports = function(RED) {
  function TwitchEventSubChannelChatMessageNode(config) {
    //@ts-expect-error any
    const node = this as any;
    RED.nodes.createNode(node, config);

    const id = Math.floor(Math.random() * 1000000);
    node.twitchConfig = RED.nodes.getNode(config.config);

    if (node.twitchConfig) {
      // On Start
      node.twitchConfig.addNode(id, node);

      // On Delete
      node.on('close', (removed: boolean, done: () => void) => {
        if (removed) {
          node.twitchConfig.removeNode(id, done);
        } else {
          done();
        }
      });
    } else {
      // No config node configured
      node.error('No Twitch Eventsub Config node configured');
    }

    node.triggerTwitchEvent = async function(event: any, subscriptionType: string) {
      if (subscriptionType === 'channelChatMessage') {
        const mapped = {
          // Message identification
          messageId: event.messageId,
          messageText: event.messageText,
          messageParts: event.messageParts,
          messageType: event.messageType,
          
          // Chatter information
          chatterId: event.chatterId,
          chatterName: event.chatterName,
          chatterDisplayName: event.chatterDisplayName,
          color: event.color,
          badges: event.badges,
          
          // Broadcaster information
          broadcasterId: event.broadcasterId,
          broadcasterName: event.broadcasterName,
          broadcasterDisplayName: event.broadcasterDisplayName,
          
          // Message metadata
          isCheer: event.isCheer,
          bits: event.bits,
          isRedemption: event.isRedemption || false,
          isSourceOnly: event.isSourceOnly || false,
          
          // Parent message info (for replies)
          parentMessageId: event.parentMessageId || null,
          parentMessageText: event.parentMessageText || null,
          parentMessageUserId: event.parentMessageUserId || null,
          parentMessageUserName: event.parentMessageUserName || null,
          parentMessageUserDisplayName: event.parentMessageUserDisplayName || null,
          
          // Reward info (if applicable)
          rewardId: event.rewardId || null,
          
          // Source info (for shared chat)
          sourceBadges: event.sourceBadges || null,
          sourceBroadcasterId: event.sourceBroadcasterId || null,
          sourceBroadcasterName: event.sourceBroadcasterName || null,
          sourceBroadcasterDisplayName: event.sourceBroadcasterDisplayName || null,
          sourceMessageId: event.sourceMessageId || null,
          
          // Thread info
          threadMessageId: event.threadMessageId || null,
          threadMessageUserId: event.threadMessageUserId || null,
          threadMessageUserName: event.threadMessageUserName || null,
          threadMessageUserDisplayName: event.threadMessageUserDisplayName || null,
        };
        
        node.send({ payload: mapped });
      }
    };
  }

  RED.nodes.registerType('twitch-eventsub-channel-chat-message', TwitchEventSubChannelChatMessageNode);
};
