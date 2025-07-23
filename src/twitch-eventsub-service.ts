import {RefreshingAuthProvider} from '@twurple/auth';
import {ApiClient} from '@twurple/api';
import {EventSubWsListener} from '@twurple/eventsub-ws';
import {AbstractNode} from '/@/AbstractNode';
import {HelixUser} from '@twurple/api/lib/endpoints/user/HelixUser';

interface TwitchEvent {
  eventType: string;
  rawEvent: unknown;
}

interface TwitchEventChannelRedemptionAdd extends TwitchEvent {
  userId: string;
  userName: string;
  userDisplayName: string;
  broadcasterId: string;
  broadcasterName: string;
  broadcasterDisplayName: string;
  id: string;
  input: string;
  redemptionDate: Date;
  rewardCost: number;
  rewardId: string;
  rewardPrompt: string;
  rewardTitle: string;
  status: string;
}

interface TwitchEventStreamOnline extends TwitchEvent {
  broadcasterId: string;
  broadcasterName: string;
  broadcasterDisplayName: string;
  startDate: Date;
  type: string;
}

interface TwitchEventStreamOffline extends TwitchEvent {
  broadcasterId: string;
  broadcasterName: string;
  broadcasterDisplayName: string;
  startDate: Date;
  type: string;
}

interface TwitchEventChannelSubscription extends TwitchEvent {
  userId: string;
  userName: string;
  userDisplayName: string;
  broadcasterId: string;
  broadcasterName: string;
  broadcasterDisplayName: string;
  id: string;
  input: string;
  redemptionDate: Date;
  rewardCost: number;
  rewardId: string;
  rewardPrompt: string;
  rewardTitle: string;
  status: string;
}

interface TwitchEventChannelCheer extends TwitchEvent {
  userId: string;
  userName: string;
  userDisplayName: string;
  broadcasterId: string;
  broadcasterName: string;
  broadcasterDisplayName: string;
  id: string;
  input: string;
  redemptionDate: Date;
  rewardCost: number;
  rewardId: string;
  rewardPrompt: string;
  rewardTitle: string;
  status: string;
}

class TwitchEventsub {
  clientId?: string | null;
  userId?: number | null;
  user!: HelixUser | null;
  authProvider: RefreshingAuthProvider;
  apiClient!: ApiClient;
  listener!: EventSubWsListener;
  node: AbstractNode;
  currentEventsubSubscriptions: unknown[] = [];

  onEventCb?: (event: any) => void;

  onAuthError?: () => void;

  private handleStreamOnline(event: any) {
    console.log(`${event.broadcasterName} is online`);
    this.node.log('streamOnline', JSON.stringify(event, null, '  '));
    if (this.onEventCb) {
      const twitchEvent: TwitchEventStreamOnline = {
        eventType: 'streamOnline',
        broadcasterId: event.broadcasterId,
        broadcasterName: event.broadcasterName,
        broadcasterDisplayName: event.broadcasterDisplayName,
        startDate: event.startDate,
        type: event.type,
        rawEvent: event
      };
      this.onEventCb(twitchEvent);
    }
  }

  private handleStreamOffline(event: any) {
    console.log(`${event.broadcasterName} is offline`);
    this.node.log('streamOffline', JSON.stringify(event, null, '  '));
    if (this.onEventCb) {
      const twitchEvent: TwitchEventStreamOffline = {
        eventType: 'streamOffline',
        broadcasterId: event.broadcasterId,
        broadcasterName: event.broadcasterName,
        broadcasterDisplayName: event.broadcasterDisplayName,
        startDate: event.startDate,
        type: event.type,
        rawEvent: event
      };
      this.onEventCb(twitchEvent);
    }
  }

  private handleChannelRedemptionAdd(event: any) {
    console.log(`${event.userDisplayName} redeemed ${event.rewardTitle}`);
    this.node.log('channelRedemptionAdd', JSON.stringify(event, null, '  '));
    if (this.onEventCb) {
      const twitchEvent: TwitchEventChannelRedemptionAdd = {
        eventType: 'channelRedemptionAdd',
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
      this.onEventCb(twitchEvent);
    }
  }

  private handleChannelSubscription(event: any) {
    console.log(`${event.userDisplayName} subscribed to ${event.broadcasterDisplayName}`);
    this.node.log('channelSubscription', JSON.stringify(event, null, '  '));
    if (this.onEventCb) {
      const twitchEvent: TwitchEventChannelSubscription = {
        eventType: 'channelSubscription',
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
      this.onEventCb(twitchEvent);
    }
  }

  private handleChannelCheer(event: any) {
    console.log(`${event.userDisplayName} cheered ${event.bits} bits`);
    this.node.log('channelCheer', JSON.stringify(event, null, '  '));
    if (this.onEventCb) {
      const twitchEvent: TwitchEventChannelCheer = {
        eventType: 'channelCheer',
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
      this.onEventCb(twitchEvent);
    }
  }

  constructor(node: AbstractNode, userId: number, clientId: string, clientSecret: string) {
    this.node = node;
    this.userId = userId;
    this.clientId = clientId;
    this.authProvider = new RefreshingAuthProvider({
      clientId: clientId,
      clientSecret: clientSecret,
    });
  }

  async init(refreshToken: string): Promise<void> {

    this.node.log('NEW TwitchEventsub', this.clientId, this.userId);
    //@ts-ignore
    await this.authProvider.addUserForToken({
      accessToken: '',
      refreshToken: refreshToken,
    });

    this.apiClient = new ApiClient({authProvider: this.authProvider});
    this.listener = new EventSubWsListener({ apiClient: this.apiClient });
  }

  async addSubscriptions() {
    this.user = await this.apiClient.users.getUserById(this.userId!);

    this.currentEventsubSubscriptions.push(this.listener.onStreamOnline(this.userId!, this.handleStreamOnline.bind(this)));
    this.currentEventsubSubscriptions.push(this.listener.onStreamOffline(this.userId!, this.handleStreamOffline.bind(this)));
    this.currentEventsubSubscriptions.push(this.listener.onChannelRedemptionAdd(this.userId!, this.handleChannelRedemptionAdd.bind(this)));
    this.currentEventsubSubscriptions.push(this.listener.onChannelSubscription(this.userId!, this.handleChannelSubscription.bind(this)));
    this.currentEventsubSubscriptions.push(this.listener.onChannelCheer(this.userId!, this.handleChannelCheer.bind(this)));

    this.node.log('WebSocket listener started');
    this.listener.start();
  }


  async stop() {
    if (this.listener) {
      await this.listener.stop();
      this.node.log('WebSocket listener stopped');
    }
  }
}

export { TwitchEventsub };