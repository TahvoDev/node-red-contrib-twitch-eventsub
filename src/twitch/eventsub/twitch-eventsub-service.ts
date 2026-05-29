import { EventSubWsListener } from '@twurple/eventsub-ws';
import { ApiClient } from '@twurple/api';
import { AbstractNode } from '/@/AbstractNode';

type SubscriptionHandler = (listener: EventSubWsListener, userId: string, cb: (event: any) => void) => void;

const SUBSCRIPTION_HANDLERS: Record<string, SubscriptionHandler> = {
  // Stream
  streamOnline:                 (l, id, cb) => l.onStreamOnline(id, cb),
  streamOffline:                (l, id, cb) => l.onStreamOffline(id, cb),

  // Channel
  channelUpdate:                (l, id, cb) => l.onChannelUpdate(id, cb),
  channelFollow:                (l, id, cb) => l.onChannelFollow(id, id, cb),
  channelBan:                   (l, id, cb) => l.onChannelBan(id, cb),
  channelUnban:                 (l, id, cb) => l.onChannelUnban(id, cb),
  channelCheer:                 (l, id, cb) => l.onChannelCheer(id, cb),
  channelRedemptionAdd:         (l, id, cb) => l.onChannelRedemptionAdd(id, cb),
  channelSubscription:          (l, id, cb) => l.onChannelSubscription(id, cb),
  channelSubscriptionGift:      (l, id, cb) => l.onChannelSubscriptionGift(id, cb),
  channelRaidFrom:              (l, id, cb) => l.onChannelRaidFrom(id, cb),
  channelRaidTo:                (l, id, cb) => l.onChannelRaidTo(id, cb),

  // Chat
  channelChatMessage:           (l, id, cb) => l.onChannelChatMessage(id, id, cb),

  // Polls
  channelPollBegin:             (l, id, cb) => l.onChannelPollBegin(id, cb),
  channelPollProgress:          (l, id, cb) => l.onChannelPollProgress(id, cb),
  channelPollEnd:               (l, id, cb) => l.onChannelPollEnd(id, cb),

  // Predictions
  channelPredictionBegin:       (l, id, cb) => l.onChannelPredictionBegin(id, cb),
  channelPredictionProgress:    (l, id, cb) => l.onChannelPredictionProgress(id, cb),
  channelPredictionLock:        (l, id, cb) => l.onChannelPredictionLock(id, cb),
  channelPredictionEnd:         (l, id, cb) => l.onChannelPredictionEnd(id, cb),

  // Hype Train
  channelHypeTrainBegin:        (l, id, cb) => l.onChannelHypeTrainBegin(id, cb),
  channelHypeTrainProgress:     (l, id, cb) => l.onChannelHypeTrainProgress(id, cb),
  channelHypeTrainEnd:          (l, id, cb) => l.onChannelHypeTrainEnd(id, cb),

  // Shoutouts
  channelShoutoutCreate:        (l, id, cb) => l.onChannelShoutoutCreate(id, id, cb),
  channelShoutoutReceive:       (l, id, cb) => l.onChannelShoutoutReceive(id, id, cb),
};

class TwitchEventsubService {
  listener: EventSubWsListener;
  node: AbstractNode;
  userId: string;
  started = false;

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
    this.subscriptionCounts.forEach((_, type) => this.registerSubscription(type));
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
