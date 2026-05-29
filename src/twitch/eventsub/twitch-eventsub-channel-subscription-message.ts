import { BaseTwitchEventsubNode } from './twitch-eventsub-base';

module.exports = function (RED: any) {
    class TwitchEventSubChannelSubscriptionMessageNode extends BaseTwitchEventsubNode {
        constructor(config: any) {
            super(RED, config);
            this.register('channelSubscriptionMessage');
        }

        mapEvent(event: any) {
            return {
                userId:                 event.userId,
                userName:               event.userName,
                userDisplayName:        event.userDisplayName,
                broadcasterId:          event.broadcasterId,
                broadcasterName:        event.broadcasterName,
                broadcasterDisplayName: event.broadcasterDisplayName,
                tier:                   event.tier,
                messageText:            event.messageText ?? '',
                cumulativeMonths:       event.cumulativeMonths ?? 1,
                streakMonths:           event.streakMonths ?? null,
                durationMonths:         event.durationMonths ?? 1,
                rawEvent:               event,
            };
        }
    }

    RED.nodes.registerType('twitch-eventsub-channel-subscription-message', TwitchEventSubChannelSubscriptionMessageNode);
};
