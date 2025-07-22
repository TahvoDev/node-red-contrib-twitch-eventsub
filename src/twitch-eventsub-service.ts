import {RefreshingAuthProvider} from '@twurple/auth';
import {ApiClient} from '@twurple/api';
import {EventSubWsListener} from '@twurple/eventsub-ws';
import type {EventSubSubscription} from '@twurple/eventsub-base/lib/subscriptions/EventSubSubscription';
import {AbstractNode} from '/@/AbstractNode';
import {DataObject, getRawData, type UserIdResolvable} from '@twurple/common';
import {HelixUser} from '@twurple/api/lib/endpoints/user/HelixUser';
import {EventSubListener} from '@twurple/eventsub-base';

type TwitchEvent = {
  eventType: string;
  userId: number;
  userName?: string | null | undefined;
  userDisplayName?: string | null | undefined;
  rawEvent: unknown;
};
type TwitchEventFollow = TwitchEvent;
type TwitchEventRedeem = TwitchEvent & {
  rewardId: string;
  rewardName: string;
  rewardMessage: string;
};
type TwitchEventRaid = TwitchEvent & {
  viewers: number;
};
type TwitchEventsubSubscribe = TwitchEvent & {
  tier: number;
};
type TwitchEventSubGift = TwitchEvent & {
  tier: number;
  amount: number;
};
type TwitchEventBits = TwitchEvent & {
  amount: number;
};
type TwitchEventStreamOnline = TwitchEvent & {
  streamDetails: unknown;
};

type EventSubSubscriptionWithStatus = {
  subscription: EventSubSubscription;
  //statusPromise: Promise<void>;
  updateStatus: (error: Error | null) => void;
};

function renameEventFromFnName(fname: string) {
  fname = fname.substring(2);
  return `${fname[0].toLowerCase()}${fname.substring(1)}`;
}

class TwitchEventsub {
  clientId?: string | null;
  userId?: number | null;
  user!: HelixUser | null;
  authProvider: RefreshingAuthProvider;
  apiClient!: ApiClient;
  listener!: EventSubWsListener;
  subscriptions: EventSubSubscriptionWithStatus[] = [];
  node: AbstractNode;
  localWebsocketUrl: string;

  onEventCb?: (event: TwitchEvent) => void;

  onAuthError?: () => void;

  constructor(
    node: AbstractNode,
    userId: number,
    clientId: string,
    clientSecret: string,
    localWebsocketUrl: string
  ) {
    this.node = node;
    this.node.log('NEW TwitchEventsub', clientId, userId);
    this.userId = userId;
    this.clientId = clientId;
    this.localWebsocketUrl = localWebsocketUrl;
    this.authProvider = new RefreshingAuthProvider({
      clientId: clientId,
      clientSecret: clientSecret,
    });
  }

  async init(refreshToken: string): Promise<void> {
    if (!this.userId) {
      return;
    }

    //@ts-ignore
    await this.authProvider.addUserForToken({
      accessToken: '',
      refreshToken: refreshToken,
    });

    this.apiClient = new ApiClient({authProvider: this.authProvider});
      
    const listenerOptions: any = { apiClient: this.apiClient };

    if (this.localWebsocketUrl && this.localWebsocketUrl.trim() !== '') {
      this.node.log('Twitch EventSub using local websocket URL:', this.localWebsocketUrl);
      listenerOptions.url = this.localWebsocketUrl;
    }

    try {
      this.node.log('[INIT] Creating EventSub WebSocket listener...');
      
      // Add debug logging for WebSocket URL
      const wsUrl = listenerOptions.url || 'wss://eventsub.wss.twitch.tv/ws';
      this.node.log(`[INIT] Connecting to WebSocket URL: ${wsUrl}`);
      
      // Add debug logging for API client
      try {
        const tokenInfo = await this.authProvider.getAnyAccessToken();
        this.node.log(`[INIT] Auth token info: ${tokenInfo ? 'Valid' : 'Invalid'}`);
        if (tokenInfo) {
          this.node.log(`[INIT] Token scopes: ${tokenInfo.scope?.join(', ')}`);
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.node.error(`[INIT] Error getting auth token: ${errorMessage}`);
      }
      
      this.listener = new EventSubWsListener(listenerOptions);
      
      // Add WebSocket event listeners for debugging
      // @ts-ignore - Accessing private property for debugging
      this.listener._client?.on('connect', () => {
        this.node.log('[WEBSOCKET] Connected to Twitch EventSub WebSocket');
      });
      
      // @ts-ignore - Accessing private property for debugging
      this.listener._client?.on('disconnect', () => {
        this.node.log('[WEBSOCKET] Disconnected from Twitch EventSub WebSocket');
      });
      
      // @ts-ignore - Accessing private property for debugging
      this.listener._client?.on('error', (error) => {
        this.node.error(`[WEBSOCKET ERROR] ${error.message}`);
      });

      this.node.log('[INIT] Fetching user details...');
      this.user = await this.apiClient.users.getUserById(this.userId ?? 0);
      if (!this.user) {
        throw new Error(`Failed to fetch user with ID: ${this.userId}`);
      }
      this.node.log(`[INIT] User authenticated as: ${this.user.displayName} (${this.user.id})`);

      this.node.log('Setting up subscription event handlers...');
      this.listener.onSubscriptionCreateSuccess((subscription) => {
        this.node.log(`[SUCCESS] Subscription Created: ${subscription.id}`);
        const subscriptionWithStatus = this.subscriptions.find(s => s.subscription.id === subscription.id);
        if (subscriptionWithStatus) {
          this.node.log(`[SUCCESS] Found and updating subscription status for: ${subscription.id}`);
          subscriptionWithStatus.updateStatus(null);
        } else {
          this.node.warn(`[WARNING] Received success for unknown subscription: ${subscription.id}`);
        }
      });

      this.listener.onSubscriptionCreateFailure((subscription, error) => {
        this.node.error(`[ERROR] Subscription Failed: ${subscription.id} - ${error.message}`);
        const subscriptionWithStatus = this.subscriptions.find(s => s.subscription.id === subscription.id);
        if (subscriptionWithStatus) {
          const errMsgEndPos = error.message.indexOf(') and can not be upgraded.');
          if (errMsgEndPos !== -1) {
            error.message = error.message.substring(0, errMsgEndPos + 1);
          }
          subscriptionWithStatus.updateStatus(error);
        } else {
          this.node.warn(`[WARNING] Received failure for unknown subscription: ${subscription.id}`);
        }
        if (this.onAuthError) {
          this.node.error('[AUTH ERROR] Triggering onAuthError callback');
          this.onAuthError();
        }
      });
      
      this.node.log('EventSub initialization completed successfully');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.node.error(`[CRITICAL] Failed to initialize EventSub: ${errorMessage}`);
      throw error; // Re-throw to be handled by the caller
    }
  }

  async addSubscriptions(): Promise<void> {
    if (!this.userId) {
      return;
    }

    const createEvent = <R extends DataObject<unknown>>(eventType: string) => {
      return (event: R) => {
        const payload: TwitchEvent = {
          eventType: eventType,
          userId: this.userId ?? 0,
          userName: this.user?.name,
          userDisplayName: this.user?.displayName,
          rawEvent: event,
        };
        payload.userId = parseInt(`${payload.userId}`);
        if (this.onEventCb) {
          this.onEventCb(payload);
        }
      };
    };

    const hardCodedSubFunctions: string[] = [
      'onSubscriptionCreateSuccess',
      'onSubscriptionCreateFailure',
      'onStreamOnline',
      'onChannelRedemptionAdd',
      'onChannelRaidTo',
      'onChannelSubscription',
      'onChannelSubscriptionGift',
      'onChannelFollow',
      'onChannelCheer',
    ];
    const ignoredSubFunctions: string[] = [
      'onChannelRewardUpdateForReward', // arg is reward Id, needs to be hardcoded or transformer updated
      'onChannelRewardRemoveForReward', // arg is reward Id, needs to be hardcoded or transformer updated
      'onChannelRedemptionAddForReward', // arg is reward Id, needs to be hardcoded or transformer updated
      'onChannelRedemptionUpdateForReward', // arg is reward Id, needs to be hardcoded or transformer updated
    ];

    const subscriptionFns0Arg = (
      // @ts-expect-error returns all functions matching the second argument; See transformers/getKeysOfType.ts
      getKeysOfType<EventSubListener, (user: UserIdResolvable, handler: (event: DataObject<unknown>) => void) => EventSubSubscription>()
        .filter((f: string) => f.startsWith('on') && !hardCodedSubFunctions.includes(f))
    );
    const subscriptionFns1Arg = (
      // @ts-expect-error returns all functions matching the second argument; See transformers/getKeysOfType.ts
      getKeysOfType<EventSubListener, (user: UserIdResolvable, other: string, handler: (event: DataObject<unknown>) => void) => EventSubSubscription>()
        .filter((f: string) => f.startsWith('on') && !hardCodedSubFunctions.includes(f))
        .filter((f: string) => !ignoredSubFunctions.includes(f))
    );
    this.node.log('Currently ignored 1arg subscriptions:\n', '- ' + ignoredSubFunctions.join('\n - '));

    const promises = Promise.all([
      this.addSubscription(this.listener.onStreamOnline(this.userId, async (event) => {
        //createEvent('streamOnline')
        //this.node.log('STREAM ONLINE');
        const streamDetails = await event.getStream();
        const payload: TwitchEventStreamOnline = {
          eventType: 'streamOnline',
          userId: this.userId ?? 0,
          userName: this.user?.name,
          userDisplayName: this.user?.displayName,
          streamDetails: streamDetails ? streamDetails : null,
          rawEvent: event,
        };
        payload.userId = parseInt(`${payload.userId}`);
        if (this.onEventCb) {
          this.onEventCb(payload);
        }
      })),
      //this.addSubscription(this.listener.onA(this.userId, createEvent('streamOffline'))),
      this.addSubscription(
        this.listener.onChannelRedemptionAdd(this.userId, (event) => {
          const payload: TwitchEventRedeem = {
            eventType: 'channelRedemptionAdd',
            userId: parseInt(event.userId),
            userName: event.userName,
            userDisplayName: event.userDisplayName,
            rewardId: event.rewardId,
            rewardName: event.rewardTitle,
            rewardMessage: event.input,
            rawEvent: event,
          };
          this.node.log('channelRedemptionAdd', JSON.stringify(payload, null, '  '));
          if (this.onEventCb) {
            this.onEventCb(payload);
          }
        })
      ),

      this.addSubscription(
        this.listener.onChannelRaidTo(this.userId, (event) => {
          const payload: TwitchEventRaid = {
            eventType: 'channelRaidTo',
            userId: parseInt(event.raidingBroadcasterId),
            userName: event.raidingBroadcasterName,
            userDisplayName: event.raidingBroadcasterDisplayName,
            viewers: event.viewers,
            rawEvent: event,  // Use the event object directly
          };
          this.node.log('channelRaidTo', JSON.stringify(payload, null, '  '));
          if (this.onEventCb) {
            this.onEventCb(payload);
          }
        })
      ),

      this.addSubscription(
        this.listener.onChannelSubscription(this.userId, (event) => {
          const payload: TwitchEventsubSubscribe = {
            eventType: 'channelSubscription',
            userId: parseInt(event.userId),
            userName: event.userName,
            userDisplayName: event.userDisplayName,
            tier: parseInt(event.tier),
            rawEvent: event,
          };
          this.node.log('channelSubscription', JSON.stringify(payload, null, '  '));
          if (this.onEventCb && !event.isGift) {
            this.onEventCb(payload);
          }
        })
      ),

      this.addSubscription(
        this.listener.onChannelSubscriptionGift(this.userId, (event) => {
          const payload: TwitchEventSubGift = {
            eventType: 'channelSubscriptionGift',
            userId: parseInt(event.gifterId),
            userName: event.gifterName,
            userDisplayName: event.gifterDisplayName,
            tier: parseInt(event.tier),
            amount: event.amount,
            rawEvent: event,
          };
          this.node.log('SUBGIFT', JSON.stringify(payload, null, '  '));
          if (this.onEventCb) {
            this.onEventCb(payload);
          }
        })
      ),

      this.addSubscription(
        this.listener.onChannelFollow(this.userId, this.userId, (event) => {
          const payload: TwitchEventFollow = {
            eventType: 'channelFollow',
            userId: parseInt(event.userId),
            userName: event.userName,
            userDisplayName: event.userDisplayName,
            rawEvent: event,
          };
          this.node.log('channelFollow', JSON.stringify(payload, null, '  '));
          if (this.onEventCb) {
            this.onEventCb(payload);
          }
        })
      ),

      this.addSubscription(
        this.listener.onChannelCheer(this.userId, (event) => {
          const payload: TwitchEventBits = {
            eventType: 'channelCheer',
            userId: parseInt(event.userId ?? '-1'),
            userName: event.userName ?? 'anonymous',
            userDisplayName: event.userDisplayName ?? 'Anonymous',
            amount: event.bits,
            rawEvent: event,
          };
          this.node.log(`channelCheer ${JSON.stringify(payload, null, '  ')}`);
          if (this.onEventCb) {
            this.onEventCb(payload);
          }
        })
      ),
    ].filter(p => !!p));

    const autogen0ArgPromises = Promise.all(subscriptionFns0Arg.map(async (fname: string) => {
      if (!this.userId) {
        return null;
      }
      const fn: (user: UserIdResolvable, handler: (event: DataObject<unknown>) => void) => EventSubSubscription = this.listener[fname];
      const eventName = renameEventFromFnName(fname);
      try {
        return await this.addSubscription(fn.bind(this.listener)(this.userId, createEvent(eventName)));
      }
      catch (e) {
        console.error(e);
      }
    }).filter(p => !!p));

    const autogen1ArgPromises = Promise.all(subscriptionFns1Arg.map(async (fname: string) => {
      if (!this.userId) {
        return null;
      }
      const fn: (user: UserIdResolvable, other: UserIdResolvable, handler: (event: DataObject<unknown>) => void) => EventSubSubscription = this.listener[fname];
      const eventName = renameEventFromFnName(fname);
      try {
        return await this.addSubscription(fn.bind(this.listener)(this.userId, this.userId, createEvent(eventName)));
      }
      catch (e) {
        console.error(e);
      }
    }).filter(p => !!p));

    this.listener.start();
    await promises;
    await autogen0ArgPromises;
    await autogen1ArgPromises;
  }

  async addSubscription(subscription: EventSubSubscription): Promise<void> {
    if (!subscription) {
      this.node.log('[Sub] No subscription provided');
      return;
    }
    
    const subId = subscription.id || 'unknown';
    this.node.log(`[Sub ${subId}] Starting subscription`);
    
    return new Promise<void>((resolve, reject) => {
      // Track if we've already resolved/rejected
      let isComplete = false;
      const startTime = Date.now();
      
      const complete = (err: Error | null = null) => {
        const elapsed = Date.now() - startTime;
        
        if (isComplete) {
          this.node.log(`[Sub ${subId}] Duplicate completion after ${elapsed}ms`);
          return;
        }
        
        isComplete = true;
        
        if (err) {
          this.node.error(`[Sub ${subId}] Failed after ${elapsed}ms: ${err.message}`);
          reject(err);
        } else {
          this.node.log(`[Sub ${subId}] Completed successfully in ${elapsed}ms`);
          resolve();
        }
      };
      
      // Add to subscriptions with updateStatus
      this.subscriptions.push({
        subscription: subscription,
        updateStatus: (err) => {
          this.node.log(`[Sub ${subId}] Received updateStatus callback`, { 
            error: err ? err.message : 'no error',
            isComplete 
          });
          complete(err);
        },
      });
      
      this.node.log(`[Sub ${subId}] Waiting for subscription confirmation...`);
      
      // Safety timeout in case updateStatus is never called
      const timeout = setTimeout(() => {
        if (!isComplete) {
          this.node.log(`[Sub ${subId}] Timeout after 5000ms, forcing completion`);
          complete(); // Resolve without error to prevent hanging
        }
      }, 5000); // 5 second timeout
    });
  }

  async stop() {
    try {
      this.node.log('Stopping TwitchEventsub...');
      const tokenInfo = await this.authProvider.getAccessTokenForUser(this.userId ?? '');
      await Promise.all(this.subscriptions.map(subscription => {
        subscription.subscription.stop();
        return this.deleteSubscription(tokenInfo?.accessToken, subscription.subscription._twitchId);
      }));
      this.subscriptions = [];
      this.listener?.stop();
    }
    catch (e) {
      console.error('Failed to gracefully shutdown', e);
    }
  }

  private async deleteSubscription(accessToken: string | undefined, subscriptionId: string | undefined) {
    //console.log('delete', subscriptionId);
    if (!accessToken || !subscriptionId) {
      return;
    }
    const myHeaders = new Headers();
    myHeaders.append("Authorization", `Bearer ${accessToken}`);
    myHeaders.append("Client-Id", this.clientId ?? '');

    await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${subscriptionId}`, {
      method: 'DELETE',
      headers: myHeaders,
      redirect: 'follow',
      signal: AbortSignal.timeout(1000),
    })
    .then(response => response.text())
    .catch(error => { console.log('error', error); return true; });
    //console.log('deleted', subscriptionId);
  }
}

export { TwitchEventsub };
