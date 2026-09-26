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
  channelSubscriptionMessage:   (l, id, cb) => l.onChannelSubscriptionMessage(id, cb),
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

  // Goals
  channelGoalBegin:            (l, id, cb) => l.onChannelGoalBegin(id, cb),
  channelGoalProgress:         (l, id, cb) => l.onChannelGoalProgress(id, cb),
  channelGoalEnd:              (l, id, cb) => l.onChannelGoalEnd(id, cb),

  // Moderation
  channelModerate:             (l, id, cb) => l.onChannelModerate(id, id, cb),
  channelModeratorAdd:         (l, id, cb) => l.onChannelModeratorAdd(id, cb),
  channelModeratorRemove:      (l, id, cb) => l.onChannelModeratorRemove(id, cb),
  channelVipAdd:               (l, id, cb) => l.onChannelVipAdd(id, cb),
  channelVipRemove:            (l, id, cb) => l.onChannelVipRemove(id, cb),
  channelWarningSend:          (l, id, cb) => l.onChannelWarningSend(id, id, cb),
  channelWarningAcknowledge:   (l, id, cb) => l.onChannelWarningAcknowledge(id, id, cb),
  channelUnbanRequestCreate:   (l, id, cb) => l.onChannelUnbanRequestCreate(id, id, cb),
  channelUnbanRequestResolve:  (l, id, cb) => l.onChannelUnbanRequestResolve(id, id, cb),
  channelSuspiciousUserMessage:(l, id, cb) => l.onChannelSuspiciousUserMessage(id, id, cb),
  channelSuspiciousUserUpdate: (l, id, cb) => l.onChannelSuspiciousUserUpdate(id, id, cb),

  // Chat settings, clearing and holds
  channelChatClear:            (l, id, cb) => l.onChannelChatClear(id, id, cb),
  channelChatClearUserMessages:(l, id, cb) => l.onChannelChatClearUserMessages(id, id, cb),
  channelChatMessageDelete:    (l, id, cb) => l.onChannelChatMessageDelete(id, id, cb),
  channelChatNotification:     (l, id, cb) => l.onChannelChatNotification(id, id, cb),
  channelChatSettingsUpdate:   (l, id, cb) => l.onChannelChatSettingsUpdate(id, id, cb),
  channelChatUserMessageHold:  (l, id, cb) => l.onChannelChatUserMessageHold(id, id, cb),
  channelChatUserMessageUpdate:(l, id, cb) => l.onChannelChatUserMessageUpdate(id, id, cb),
  channelShieldModeBegin:      (l, id, cb) => l.onChannelShieldModeBegin(id, id, cb),
  channelShieldModeEnd:        (l, id, cb) => l.onChannelShieldModeEnd(id, id, cb),

  // AutoMod
  autoModMessageHold:          (l, id, cb) => l.onAutoModMessageHold(id, id, cb),
  autoModMessageHoldV2:        (l, id, cb) => l.onAutoModMessageHoldV2(id, id, cb),
  autoModMessageUpdate:        (l, id, cb) => l.onAutoModMessageUpdate(id, id, cb),
  autoModMessageUpdateV2:      (l, id, cb) => l.onAutoModMessageUpdateV2(id, id, cb),
  autoModSettingsUpdate:       (l, id, cb) => l.onAutoModSettingsUpdate(id, id, cb),
  autoModTermsUpdate:          (l, id, cb) => l.onAutoModTermsUpdate(id, id, cb),

  // Shared chat
  channelSharedChatSessionBegin:  (l, id, cb) => l.onChannelSharedChatSessionBegin(id, cb),
  channelSharedChatSessionUpdate: (l, id, cb) => l.onChannelSharedChatSessionUpdate(id, cb),
  channelSharedChatSessionEnd:    (l, id, cb) => l.onChannelSharedChatSessionEnd(id, cb),

  // Subscriptions and rewards
  channelSubscriptionEnd:      (l, id, cb) => l.onChannelSubscriptionEnd(id, cb),
  channelRedemptionUpdate:     (l, id, cb) => l.onChannelRedemptionUpdate(id, cb),
  channelRewardAdd:            (l, id, cb) => l.onChannelRewardAdd(id, cb),
  channelRewardUpdate:         (l, id, cb) => l.onChannelRewardUpdate(id, cb),
  channelRewardRemove:         (l, id, cb) => l.onChannelRewardRemove(id, cb),
  channelAutomaticRewardRedemptionAdd:  (l, id, cb) => l.onChannelAutomaticRewardRedemptionAdd(id, cb),
  channelAutomaticRewardRedemptionAddV2:(l, id, cb) => l.onChannelAutomaticRewardRedemptionAddV2(id, cb),

  // Hype Train v2
  channelHypeTrainBeginV2:     (l, id, cb) => l.onChannelHypeTrainBeginV2(id, cb),
  channelHypeTrainProgressV2:  (l, id, cb) => l.onChannelHypeTrainProgressV2(id, cb),
  channelHypeTrainEndV2:       (l, id, cb) => l.onChannelHypeTrainEndV2(id, cb),

  // Charity
  channelCharityCampaignStart:   (l, id, cb) => l.onChannelCharityCampaignStart(id, cb),
  channelCharityCampaignProgress:(l, id, cb) => l.onChannelCharityCampaignProgress(id, cb),
  channelCharityCampaignStop:    (l, id, cb) => l.onChannelCharityCampaignStop(id, cb),
  channelCharityDonation:        (l, id, cb) => l.onChannelCharityDonation(id, cb),

  // Bits and ad breaks
  channelBitsUse:              (l, id, cb) => l.onChannelBitsUse(id, cb),
  channelAdBreakBegin:         (l, id, cb) => l.onChannelAdBreakBegin(id, cb),

  // User
  userUpdate:                  (l, id, cb) => l.onUserUpdate(id, cb),
  userWhisperMessage:          (l, id, cb) => l.onUserWhisperMessage(id, cb),
  userAuthorizationGrant:      (l, id, cb) => l.onUserAuthorizationGrant(cb),
  userAuthorizationRevoke:     (l, id, cb) => l.onUserAuthorizationRevoke(cb),

};

const RESTORE_RETRY_DELAY = 2000;
const MAX_RESTORE_RETRIES = 5;

class TwitchEventsubService {
  listener: EventSubWsListener;
  node: AbstractNode;
  userId: string;
  started = false;

  private subscriptionCounts: Map<string, number> = new Map();
  private reconnectingUsers: Set<string> = new Set();
  private pendingSubscriptions: Set<string> = new Set();
  private restoring = false;
  private retryTimer?: NodeJS.Timeout;
  private retries = 0;

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
    try {
      handler(this.listener, this.userId, (event) => {
        if (this.onEventCb) this.onEventCb(event, type);
      });
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
    this.schedulePendingRetry();
  }

  /**
   * A socket only reports itself ready a moment after the connect event, and topics that
   * need a user token are refused until then, so the leftovers get another try shortly after.
   */
  private schedulePendingRetry() {
    if (!this.pendingSubscriptions.size || this.retries >= MAX_RESTORE_RETRIES) return;

    this.retries += 1;
    this.retryTimer = setTimeout(() => {
      const pending = this.pendingSubscriptions.size;
      this.node.log(`Retrying ${pending} EventSub subscription(s)`);
      this.restoreSubscriptions();
    }, RESTORE_RETRY_DELAY);
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
    this.reconnectingUsers.clear();
    this.pendingSubscriptions.clear();
    this.retries = 0;
  }
}

export { TwitchEventsubService };
