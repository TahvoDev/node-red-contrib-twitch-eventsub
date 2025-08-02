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
          // Message details
          messageId: event.messageId,
          messageText: event.messageText,
          messageParts: event.messageParts,
          messageType: event.messageType,
          
          // User who sent the message
          chatterId: event.chatterId,
          chatterName: event.chatterName,
          chatterDisplayName: event.chatterDisplayName,
          chatterColor: event.color,
          chatterBadges: event.badges,
          
          // Channel where the message was sent
          broadcasterId: event.broadcasterId,
          broadcasterName: event.broadcasterName,
          broadcasterDisplayName: event.broadcasterDisplayName,
          
          // Message metadata
          isCheer: event.isCheer,
          bits: event.bits,
          isHighlighted: event.isHighlighted,
          isMe: event.isMe,
          isReply: event.isReply,
          isFirstMessage: event.isFirstMessage,
          isSubscriber: event.isSubscriber,
          isMod: event.isMod,
          isVip: event.isVip,
          
          // Timestamp
          timestamp: event.timestamp,
          
          // Raw event data
          rawEvent: event,
        };
        
        node.send({ payload: mapped });
      }
    };
  }

  RED.nodes.registerType('twitch-eventsub-channel-chat-message', TwitchEventSubChannelChatMessageNode);
};
