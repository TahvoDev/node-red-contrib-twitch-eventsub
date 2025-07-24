module.exports = function(RED) {
  function TwitchEventSubChannelRaidFromNode(config) {
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
      if (subscriptionType === 'channelRaidFrom') {
        const mapped = {
          fromBroadcasterId: event.raidingBroadcasterId || event.fromBroadcasterId || event.broadcasterId,
          fromBroadcasterName: event.raidingBroadcasterName || event.fromBroadcasterName || event.broadcasterName,
          fromBroadcasterDisplayName: event.raidingBroadcasterDisplayName || event.fromBroadcasterDisplayName || event.broadcasterDisplayName,
          toBroadcasterId: event.toBroadcasterId,
          toBroadcasterName: event.toBroadcasterName,
          toBroadcasterDisplayName: event.toBroadcasterDisplayName,
          viewers: event.viewers,
          rawEvent: event
        };
        node.send({ payload: mapped });
      }
    };
  }

  TwitchEventSubChannelRaidFromNode.icon = 'twitch-icon.png';
  RED.nodes.registerType("twitch-eventsub-channel-raid-from", TwitchEventSubChannelRaidFromNode);
};
