import { EventSubWsListener } from '@twurple/eventsub-ws';
import { ApiClient } from '@twurple/api';
import { AbstractNode } from '/@/AbstractNode';

class TwitchEventsubService {
  listener: EventSubWsListener;
  node: AbstractNode;
  userId: string;

  onEventCb?: (event: any, subscriptionType: string) => void;

  constructor(node: AbstractNode, userId: string, apiClient: ApiClient) {
    this.node = node;
    this.userId = userId;
    this.listener = new EventSubWsListener({ apiClient });
  }

  private handleEvent(event: any, subscriptionType: string) {
    if (this.onEventCb) {
      this.onEventCb(event, subscriptionType);
    }
  }

  async start(): Promise<void> {
    const id = this.userId;

    this.listener.onStreamOnline(id, (e) => this.handleEvent(e, 'streamOnline'));
    this.listener.onStreamOffline(id, (e) => this.handleEvent(e, 'streamOffline'));
    this.listener.onChannelRedemptionAdd(id, (e) => this.handleEvent(e, 'channelRedemptionAdd'));
    this.listener.onChannelSubscription(id, (e) => this.handleEvent(e, 'channelSubscription'));
    this.listener.onChannelSubscriptionGift(id, (e) => this.handleEvent(e, 'channelSubscriptionGift'));
    this.listener.onChannelCheer(id, (e) => this.handleEvent(e, 'channelCheer'));
    this.listener.onChannelRaidFrom(id, (e) => this.handleEvent(e, 'channelRaidFrom'));
    this.listener.onChannelRaidTo(id, (e) => this.handleEvent(e, 'channelRaidTo'));
    this.listener.onChannelFollow(id, id, (e) => this.handleEvent(e, 'channelFollow'));
    this.listener.onChannelChatMessage(id, id, (e) => this.handleEvent(e, 'channelChatMessage'));

    this.node.log('EventSub WebSocket listener started');
    this.listener.start();
  }

  async stop(): Promise<void> {
    if (this.listener) {
      await this.listener.stop();
      this.node.log('EventSub WebSocket listener stopped');
    }
  }
}

export { TwitchEventsubService };
