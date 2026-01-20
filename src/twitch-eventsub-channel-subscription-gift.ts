module.exports = function(RED) {
  function TwitchEventSubChannelSubscriptionGiftNode(config) {
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
            node.error('No Twitch Eventsub Config node configured');
        }
        
        node.triggerTwitchEvent = async function(event: any, subscriptionType: string) {
            if (subscriptionType === 'channelSubscriptionGift') {
                const mapped = {
                    // Broadcaster info
                    broadcasterId: event.broadcasterId,
                    broadcasterName: event.broadcasterName,
                    broadcasterDisplayName: event.broadcasterDisplayName,
                    
                    // Gifter info
                    gifterId: event.gifterId,
                    gifterName: event.gifterName,
                    gifterDisplayName: event.gifterDisplayName,
                    
                    // Subscription details
                    tier: event.tier,
                    amount: event.amount,
                    cumulativeAmount: event.cumulativeAmount,
                    isAnonymous: event.isAnonymous,
                    
                    // Raw event data
                    rawEvent: event
                };
                
                node.send({ payload: mapped });
            }
        };
  }
  
  RED.nodes.registerType('twitch-eventsub-channel-subscription-gift', TwitchEventSubChannelSubscriptionGiftNode);
};
