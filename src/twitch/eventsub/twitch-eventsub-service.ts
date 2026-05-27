import { EventSubWsListener } from '@twurple/eventsub-ws';
import { ApiClient } from '@twurple/api';
import { AbstractNode } from '/@/AbstractNode';

type SubscriptionHandler = (listener: EventSubWsListener, userId: string, cb: (event: any) => void) => void;

const SUBSCRIPTION_HANDLERS: Record<string, SubscriptionHandler> = {
  streamOnline:            (l, id, cb) => l.onStreamOnline(id, cb),
  streamOffline:           (l, id, cb) => l.onStreamOffline(id, cb),
  channelRedemptionAdd:    (l, id, cb) => l.onChannelRedemptionAdd(id, cb),
  channelSubscription:     (l, id, cb) => l.onChannelSubscription(id, cb),
  channelSubscriptionGift: (l, id, cb) => l.onChannelSubscriptionGift(id, cb),
  channelCheer:            (l, id, cb) => l.onChannelCheer(id, cb),
  channelRaidFrom:         (l, id, cb) => l.onChannelRaidFrom(id, cb),
  channelRaidTo:           (l, id, cb) => l.onChannelRaidTo(id, cb),
  channelFollow:           (l, id, cb) => l.onChannelFollow(id, id, cb),
  channelChatMessage:      (l, id, cb) => l.onChannelChatMessage(id, id, cb),
};

class TwitchEventsubService {
  listener: EventSubWsListener;
  node: AbstractNode;
  userId: string;
  started = false;

  // Track which subscription types are active and how many nodes want them
  private subscriptionCounts: Map<string, number> = new Map();

  onEventCb?: (event: any, subscriptionType: string) => void;

  constructor(node: AbstractNode, userId: string, apiClient: ApiClient) {
    this.node = node;
    this.userId = userId;
    this.listener = new EventSubWsListener({ apiClient });
  }

  addSubscription(type: string) {
    const count = this.subscriptionCounts.get(type) ?? 0;
    this.subscriptionCounts.set(type, count + 1);

    // Only register with Twitch if this is the first node of this type
    if (count === 0 && this.started) {
      this.registerSubscription(type);
    }
  }

  removeSubscription(type: string) {
    const count = this.subscriptionCounts.get(type) ?? 0;
    if (count <= 1) {
      this.subscriptionCounts.delete(type);
    } else {
      this.subscriptionCounts.set(type, count - 1);
    }
  }

  private registerSubscription(type: string) {
    const handler = SUBSCRIPTION_HANDLERS[type];
    if (!handler) {
      this.node.warn(`Unknown subscription type: ${type}`);
      return;
    }
    handler(this.listener, this.userId, (event) => {
      if (this.onEventCb) this.onEventCb(event, type);
    });
      this.node.log(`Subscribed to ${type}`);
  }

  async start(): Promise<void> {
    // Register all currently requested subscription types
    for (const type of this.subscriptionCounts.keys()) {
      this.registerSubscription(type);
    }

    this.node.log('EventSub WebSocket listener started');
    this.listener.start();
    this.started = true;
  }

  async stop(): Promise<void> {
    if (this.listener) {
      await this.listener.stop();
      this.node.log('EventSub WebSocket listener stopped');
    }
    this.started = false;
    this.subscriptionCounts.clear();
  }
}

export { TwitchEventsubService };
