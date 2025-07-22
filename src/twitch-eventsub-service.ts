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
  clientId: string;
  userId: number;
  user: HelixUser | null = null;
  authProvider: RefreshingAuthProvider;
  apiClient!: ApiClient;
  listener!: EventSubWsListener;
  subscriptions: EventSubSubscriptionWithStatus[] = [];
  node: AbstractNode;
  localWebsocketUrl: string;
  reconnectAttempts: number = 0;
  maxReconnectAttempts: number = 5;
  reconnectDelay: number = 5000; // 5 seconds

  onEventCb?: (event: TwitchEvent) => void;
  onAuthError?: () => void;
  onConnectionError?: (error: Error) => void;

  constructor(
    node: AbstractNode,
    userId: number,
    clientId: string,
    clientSecret: string,
    localWebsocketUrl: string
  ) {
    this.node = node;
    this.userId = userId;
    this.clientId = clientId;
    this.localWebsocketUrl = localWebsocketUrl;
    
    this.node.log('Initializing TwitchEventsub', { clientId, userId });
    
    try {
      this.authProvider = new RefreshingAuthProvider({
        clientId: clientId,
        clientSecret: clientSecret,
      });
      
      // Set up token refresh handler
      this.authProvider.onRefresh(async (userId, newTokenData) => {
        this.node.log(`Auth token refreshed for user ${userId}`);
      });
      
      // Set up refresh failure handler with proper error type
      this.authProvider.onRefreshFailure((userId: string, error: Error) => {
        const errorMsg = `Failed to refresh token for user ${userId}: ${error.message}`;
        this.node.error(errorMsg);
        if (this.onAuthError) {
          this.onAuthError();
        }
      });
      
    } catch (error) {
      this.node.error(`Failed to initialize auth provider: ${error.message}`);
      throw error;
    }
  }

  async init(refreshToken: string): Promise<void> {
    if (!this.userId) {
      throw new Error('User ID is required for initialization');
    }

    try {
      this.node.log('Initializing Twitch EventSub with refresh token...');
      
      //@ts-ignore
      await this.authProvider.addUserForToken({
        accessToken: '',
        refreshToken: refreshToken,
      });

      this.apiClient = new ApiClient({
        authProvider: this.authProvider,
        logger: { minLevel: 'warning' }
      });
      
      const listenerOptions: any = { 
        apiClient: this.apiClient,
        logger: {
          minLevel: 'debug',
          custom: (level, message) => {
            this.node.log(`[Twurple] ${level}: ${message}`);
          }
        }
      };

      if (this.localWebsocketUrl && this.localWebsocketUrl.trim() !== '') {
        this.node.log(`Using local WebSocket URL: ${this.localWebsocketUrl}`);
        listenerOptions.url = this.localWebsocketUrl;
      } else {
        this.node.log('Using default Twitch EventSub WebSocket URL');
      }

      this.listener = new EventSubWsListener(listenerOptions);
      this.setupEventHandlers();

      this.user = await this.apiClient.users.getUserById(this.userId);
      this.node.log(`Authenticated as user: ${this.user?.displayName} (${this.user?.id})`);

      // Start the listener
      await this.listener.start();
      this.node.log('EventSub listener started successfully');
      this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during initialization';
      this.node.error(`Failed to initialize Twitch EventSub: ${errorMessage}`);
      
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        this.node.log(`Will attempt to reconnect in ${delay/1000} seconds (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.init(refreshToken);
      }
      
      throw error instanceof Error ? error : new Error(errorMessage);
    }
  }
  
  private setupEventHandlers(): void {
    // Handle subscription creation success
    this.listener.onSubscriptionCreateSuccess((subscription) => {
      this.node.log(`✅ Subscription Created: ${subscription.id}`);
      const subscriptionWithStatus = this.subscriptions.find(s => s.subscription.id === subscription.id);
      if (subscriptionWithStatus) {
        subscriptionWithStatus.updateStatus(null);
      }
    });

    // Handle subscription creation failure
    this.listener.onSubscriptionCreateFailure((subscription, error: Error) => {
      const errorMsg = `❌ Subscription Failed: ${subscription.id} - ${error.message}`;
      this.node.error(errorMsg);
      
      const subscriptionWithStatus = this.subscriptions.find(s => s.subscription.id === subscription.id);
      if (subscriptionWithStatus) {
        subscriptionWithStatus.updateStatus(new Error(errorMsg));
      }
      
      if (this.onConnectionError) {
        this.onConnectionError(new Error(errorMsg));
      }
    });
    
    // Handle WebSocket connection errors using the underlying socket
    const wsClient = (this.listener as any).client;
    if (wsClient) {
      wsClient.on('error', (error: Error) => {
        const errorMsg = `WebSocket error: ${error.message}`;
        this.node.error(errorMsg);
        if (this.onConnectionError) {
          this.onConnectionError(new Error(errorMsg));
        }
      });
      
      wsClient.on('connect', () => {
        this.node.log('✅ WebSocket connection established with Twitch EventSub');
      });
      
      wsClient.on('close', (code: number, reason: string) => {
        const closeMsg = `WebSocket connection closed: ${reason || 'No reason provided'} (code: ${code})`;
        this.node.warn(closeMsg);
        
        // Attempt to reconnect if the connection was closed unexpectedly
        if (code !== 1000) { // 1000 is a normal closure
          this.node.log('Attempting to reconnect...');
          setTimeout(() => this.reconnect(), this.reconnectDelay);
        }
      });
    } else {
      this.node.warn('Could not access WebSocket client for error handling');
    }
  }
  
  private async reconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.node.error('Max reconnection attempts reached');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      30000 // Max 30 seconds between retries
    );
    
    this.node.log(`Attempting to reconnect in ${delay/1000} seconds (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    try {
      await new Promise(resolve => setTimeout(resolve, delay));
      await this.listener.start();
      this.reconnectAttempts = 0; // Reset on successful reconnection
      this.node.log('Successfully reconnected to Twitch EventSub');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during reconnection';
      this.node.error(`Reconnection attempt ${this.reconnectAttempts} failed: ${errorMessage}`);
      // Will retry on the next connection close
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
      const error = new Error('Cannot add null or undefined subscription');
      this.node.error(error.message);
      throw error;
    }

    // Get the subscription type for logging
    const subscriptionType = (subscription as any)._type || 'unknown';
    this.node.log(`Adding subscription: ${subscription.id} (${subscriptionType})`);
    
    return new Promise<void>((resolve, reject) => {
      const updateStatus = (err: Error | null) => {
        if (err) {
          this.node.error(`❌ Subscription ${subscription.id} failed: ${err.message}`);
          reject(err);
        } else {
          this.node.log(`✅ Subscription ${subscription.id} created successfully`);
          resolve();
        }
      };

      // Add a small delay to prevent overwhelming the server with requests
      setTimeout(() => {
        try {
          this.subscriptions.push({
            subscription: subscription,
            updateStatus: updateStatus,
          });
          
          // Log subscription details for debugging
          this.node.log(`Subscription details: ${
            JSON.stringify({
              id: subscription.id,
              type: subscriptionType,
              status: 'pending',
              createdAt: new Date().toISOString()
            }, null, 2)
          }`);
          
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error adding subscription';
          this.node.error(`Failed to add subscription: ${errorMessage}`);
          reject(new Error(errorMessage));
        }
      }, 100); // Small delay to prevent rate limiting
    });
  }

  async stop(): Promise<void> {
    this.node.log('Stopping TwitchEventsub...');
    
    try {
      // Stop all active subscriptions
      const stopPromises = this.subscriptions.map(async (sub) => {
        try {
          this.node.log(`Stopping subscription: ${sub.subscription.id}`);
          await sub.subscription.stop();
          this.node.log(`Successfully stopped subscription: ${sub.subscription.id}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.node.error(`Error stopping subscription ${sub.subscription.id}: ${errorMessage}`);
          // Don't rethrow to ensure we try to stop all subscriptions
        }
      });
      
      // Wait for all subscriptions to stop
      await Promise.all(stopPromises);
      
      // Clear the subscriptions array
      this.subscriptions = [];
      
      // Stop the listener if it exists
      if (this.listener) {
        try {
          this.node.log('Stopping EventSub listener...');
          await this.listener.stop();
          this.node.log('Successfully stopped EventSub listener');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.node.error(`Error stopping EventSub listener: ${errorMessage}`);
          throw error; // Re-throw to be handled by the outer try-catch
        }
      }
      
      this.node.log('TwitchEventsub stopped successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.node.error(`Failed to gracefully shutdown TwitchEventsub: ${errorMessage}`);
      throw error; // Re-throw to allow the caller to handle the error
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
