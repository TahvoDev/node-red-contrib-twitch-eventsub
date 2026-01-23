module.exports = function(RED) {
  function TwitchEventSubChannelFollowNode(config) {
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
      if (subscriptionType === 'channelFollow') {
        const mapped = {
          // User who followed the channel
          userId: event.userId,
          userName: event.userName,
          userDisplayName: event.userDisplayName,
          
          // Channel that was followed
          broadcasterId: event.broadcasterId,
          broadcasterName: event.broadcasterName,
          broadcasterDisplayName: event.broadcasterDisplayName,
          
          // Follow details - using followDate as per the docs
          followDate: event.followDate,
          
          // Raw event data
          rawEvent: event,
        };
        
        node.send({ payload: mapped });
      }
    };
  }

  TwitchEventSubChannelFollowNode.icon = 'twitch-icon.png';
  RED.nodes.registerType("twitch-eventsub-channel-follow", TwitchEventSubChannelFollowNode);
};
