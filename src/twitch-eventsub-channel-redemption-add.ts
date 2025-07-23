module.exports = function(RED) {
  function TwitchEventSubChannelRedemptionAddNode(config) {
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

    node.triggerTwitchEvent = function(event) {
      console.log("trying to trigger event channelRedemptionAdd");

      if(event.eventType === 'channelRedemptionAdd') {
        const mapped = {
          userId: event.userId,
          userName: event.userName,
          userDisplayName: event.userDisplayName,
          broadcasterId: event.broadcasterId,
          broadcasterName: event.broadcasterName,
          broadcasterDisplayName: event.broadcasterDisplayName,
          id: event.id,
          input: event.input,
          redemptionDate: event.redemptionDate,
          rewardCost: event.rewardCost,
          rewardId: event.rewardId,
          rewardPrompt: event.rewardPrompt,
          rewardTitle: event.rewardTitle,
          status: event.status,
          rawEvent: event
        };
        console.log("triggered event channelRedemptionAdd", mapped);
        node.send({ payload: mapped });
      }
    };
  }

  TwitchEventSubChannelRedemptionAddNode.icon = 'twitch-icon.png';

  RED.nodes.registerType("twitch-eventsub-channel-redemption-add", TwitchEventSubChannelRedemptionAddNode);
}
