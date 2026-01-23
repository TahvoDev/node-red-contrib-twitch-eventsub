module.exports = function(RED) {
  function TwitchEventSubChannelRaidToNode(config) {
    //@ts-expect-error any
    const node = this as any;
    RED.nodes.createNode(node, config);

    const id = Math.floor(Math.random() * 1000000);
    node.twitchConfig = RED.nodes.getNode(config.config);

    if (node.twitchConfig) {
      // On Start
      node.twitchConfig.addNode(id, node);

      // On Delete
      node.on('close', (removed, done) => {
        if (removed) {
          node.twitchConfig.removeNode(id, done);
        } else {
          done();
        }
      });
    } else {
      node.error('No Twitch Eventsub Config node configured');
    }

    node.triggerTwitchEvent = function(event, subscriptionType) {
      if (subscriptionType === 'channelRaidTo') {
        const mapped = {
          fromBroadcasterId: event.fromBroadcasterId,
          fromBroadcasterName: event.fromBroadcasterName,
          fromBroadcasterDisplayName: event.fromBroadcasterDisplayName,
          toBroadcasterId: event.raidedBroadcasterId || event.toBroadcasterId || event.broadcasterId,
          toBroadcasterName: event.raidedBroadcasterName || event.toBroadcasterName || event.broadcasterName,
          toBroadcasterDisplayName: event.raidedBroadcasterDisplayName || event.toBroadcasterDisplayName || event.broadcasterDisplayName,
          viewers: event.viewers,
          rawEvent: event
        };
        node.send({ payload: mapped });
      }
    };
  }

  TwitchEventSubChannelRaidToNode.icon = 'twitch-icon.png';
  RED.nodes.registerType("twitch-eventsub-channel-raid-to", TwitchEventSubChannelRaidToNode);
};
