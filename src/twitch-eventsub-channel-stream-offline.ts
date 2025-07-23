module.exports = function(RED) {
  function TwitchEventSubChannelStreamOfflineNode(config) {
    //@ts-expect-error any
    const node = this as any;
    RED.nodes.createNode(node, config);

    const id = Math.floor(Math.random()*1000000);

    node.twitchConfig = RED.nodes.getNode(config.config);

    if (node.twitchConfig) {
      // On Start
      node.twitchConfig.addNode(id, node);

      // On Delete
      node.on('close', (removed: boolean, done: () => void) => {
        if (removed) {
          node.twitchConfig.removeNode(id, done);
        }
        else {
          done();
        }
      });
    }
    else {
      // No config node configured
      // TODO show error message if no config found
    }

    node.triggerTwitchEvent = function(event, subscriptionType) {
      if(subscriptionType === 'streamOffline') {
        const mapped = {
          broadcasterId: event.broadcasterId,
          broadcasterName: event.broadcasterName,
          broadcasterDisplayName: event.broadcasterDisplayName,
          startDate: event.startDate,
          type: event.type,
          rawEvent: event
        };
        node.send({ payload: mapped });
      }
    };
  }

  TwitchEventSubChannelStreamOfflineNode.icon = 'twitch-icon.png';

  RED.nodes.registerType("twitch-eventsub-channel-stream-offline", TwitchEventSubChannelStreamOfflineNode);
}
