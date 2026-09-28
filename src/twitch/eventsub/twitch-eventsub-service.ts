import { EventSubWsListener } from '@twurple/eventsub-ws';
import { ApiClient } from '@twurple/api';
import type { Node } from 'node-red';
import { EVENTS_BY_TYPE } from './eventsub-registry';

const RESTORE_RETRY_BASE_DELAY = 2000;
const RESTORE_RETRY_MAX_DELAY = 30000;
const MAX_RESTORE_RETRIES = 5;

class TwitchEventsubService {
  listener: EventSubWsListener;
  node: Node;
  userId: string;
  started = false;

  private subscriptionCounts: Map<string, number> = new Map();
  // The live Twurple subscription per type, so removing the last node for a type
  // actually unsubscribes instead of leaving a dead topic registered. In-place
  // event switches and delete/recreate both route through here.
  private activeSubscriptions: Map<string, { stop(): void }> = new Map();
  private reconnectingUsers: Set<string> = new Set();
  private pendingSubscriptions: Set<string> = new Set();
  private warnedUnsupported: Set<string> = new Set();
  private restoring = false;
  private retryTimer?: NodeJS.Timeout;
  private retries = 0;

  onEventCb?: (event: any, subscriptionType: string) => void;
  onUnsupportedCb?: (subscriptionType: string) => void;

  constructor(node: Node, userId: string, apiClient: ApiClient) {
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
      this.unsubscribe(type);
    } else {
      this.subscriptionCounts.set(type, count - 1);
    }
  }

  private unsubscribe(type: string) {
    const subscription = this.activeSubscriptions.get(type);
    if (!subscription) return;

    this.activeSubscriptions.delete(type);
    try {
      subscription.stop();
    } catch (error) {
      this.node.warn(`Failed to unsubscribe from ${type}: ${(error as Error).message}`);
    }
  }

  private registerSubscription(type: string) {
    const definition = EVENTS_BY_TYPE[type];
    if (!definition) {
      this.node.warn(`Unknown subscription type: ${type}`);
      return;
    }

    if (definition.unsupportedReason) {
      // Twurple would throw for these, and the throw happens inside a listener callback
      // during restore, which is enough to take the whole runtime down. They can never
      // deliver over a WebSocket, so say so once and leave them alone.
      if (!this.warnedUnsupported.has(type)) {
        this.warnedUnsupported.add(type);
        this.node.warn(definition.unsupportedReason);
        this.onUnsupportedCb?.(type);
      }
      return;
    }

    try {
      const subscription = definition.subscribe(this.listener, this.userId, (event) => {
        if (this.onEventCb) this.onEventCb(event, type);
      }) as unknown as { stop(): void } | undefined;

      // A resubscribe after a socket reconnect would otherwise leave the previous
      // subscription — and its Twitch topic — registered under this type.
      this.unsubscribe(type);
      if (subscription) this.activeSubscriptions.set(type, subscription);

      this.pendingSubscriptions.delete(type);
      this.node.log(`Subscribed to ${type}`);
    } catch (error) {
      // While restoring, Twurple refuses a few topics until the socket is ready again, so
      // they are retried a few times instead of taking the whole runtime down with them.
      if (this.restoring) {
        this.pendingSubscriptions.add(type);
        this.node.warn(`Could not resubscribe to ${type} yet: ${(error as Error).message}`);
      } else {
        this.node.error(`Failed to subscribe to ${type}: ${error as Error}`);
      }
    }
  }

  private restoreSubscriptions() {
    this.restoring = true;
    this.subscriptionCounts.forEach((_, type) => this.registerSubscription(type));
    this.restoring = false;
    // A clean restore means the previous outage is over, so give the next one a
    // full retry budget instead of carrying the old attempt count forever.
    if (!this.pendingSubscriptions.size) this.retries = 0;
    this.schedulePendingRetry();
  }

  /**
   * A socket only reports itself ready a moment after the connect event, and topics that
   * need a user token are refused until then, so the leftovers get another try shortly
   * after. The delay grows exponentially so a socket in a bad state is not hammered.
   */
  private schedulePendingRetry() {
    if (!this.pendingSubscriptions.size || this.retries >= MAX_RESTORE_RETRIES) return;

    this.retries += 1;
    const delay = Math.min(
      RESTORE_RETRY_BASE_DELAY * 2 ** (this.retries - 1),
      RESTORE_RETRY_MAX_DELAY
    );

    this.retryTimer = setTimeout(() => {
      const pending = this.pendingSubscriptions.size;
      this.node.log(`Retrying ${pending} EventSub subscription(s)`);
      this.restoreSubscriptions();
    }, delay);
  }

  async start(): Promise<void> {
    // Twitch closes and reopens EventSub WebSocket connections on its own
    // schedule, and the subscriptions do not survive that. Twurple reports the
    // connection change but does not resubscribe, so we have to do it here or
    // the nodes stay connected while silently receiving nothing.
    this.retries = 0;
    this.listener.onUserSocketConnect((userId: string) => {
      if (!this.reconnectingUsers.delete(userId)) return;

      this.node.log('WebSocket reconnected, restoring EventSub subscriptions');
      this.restoreSubscriptions();
    });

    this.listener.onUserSocketDisconnect((userId: string) => {
      this.reconnectingUsers.add(userId);
    });

    this.subscriptionCounts.forEach((_, type) => this.registerSubscription(type));
    this.node.log('EventSub WebSocket listener started');
    this.listener.start();
    this.started = true;
  }

  async stop(): Promise<void> {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
    if (this.listener) {
      await this.listener.stop();
      this.node.log('EventSub WebSocket listener stopped');
    }
    this.started = false;
    this.subscriptionCounts.clear();
    this.activeSubscriptions.clear();
    this.reconnectingUsers.clear();
    this.pendingSubscriptions.clear();
    this.warnedUnsupported.clear();
    this.retries = 0;
  }
}

export { TwitchEventsubService };
