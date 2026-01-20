import {RefreshingAuthProvider} from '@twurple/auth';
import {ApiClient} from '@twurple/api';
import {EventSubWsListener} from '@twurple/eventsub-ws';
import {AbstractNode} from '/@/AbstractNode';
import {HelixUser} from '@twurple/api/lib/endpoints/user/HelixUser';

class TwitchEventsub {
  clientId?: string | null;
  userId?: number | null;
  user!: HelixUser | null;
  authProvider: RefreshingAuthProvider;
  apiClient!: ApiClient;
  listener!: EventSubWsListener;
  node: AbstractNode;
  currentEventsubSubscriptions: unknown[] = [];

  onEventCb?: (event: any, subscriptionType: string) => void;

  onAuthError?: () => void;

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

  private handleEvent(event: any, subscriptionType: string) {
    console.log('New ' + subscriptionType + ' event received');
    if (this.onEventCb) {
      this.onEventCb(event, subscriptionType);
    }
  }

  async addSubscriptions() {
    this.user = await this.apiClient.users.getUserById(this.userId!);

    this.listener.onStreamOnline(this.userId!, (event) => this.handleEvent(event, 'streamOnline'));
    this.listener.onStreamOffline(this.userId!, (event) => this.handleEvent(event, 'streamOffline'));
    this.listener.onChannelRedemptionAdd(this.userId!, (event) => this.handleEvent(event, 'channelRedemptionAdd'));
    this.listener.onChannelSubscription(this.userId!, (event) => this.handleEvent(event, 'channelSubscription'));
    this.listener.onChannelSubscriptionGift(this.userId!, (event) => this.handleEvent(event, 'channelSubscriptionGift'));
    this.listener.onChannelCheer(this.userId!, (event) => this.handleEvent(event, 'channelCheer'));
    this.listener.onChannelRaidFrom(this.userId!, (event) => this.handleEvent(event, 'channelRaidFrom'));
    this.listener.onChannelRaidTo(this.userId!, (event) => this.handleEvent(event, 'channelRaidTo'));
    this.listener.onChannelFollow(this.userId!, this.userId!, (event) => this.handleEvent(event, 'channelFollow'));
    this.listener.onChannelChatMessage(this.userId!, this.userId!, (event) => this.handleEvent(event, 'channelChatMessage'));

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