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

  onEventCb?: (event: any) => void;

  onAuthError?: () => void;

  private handleEvent(eventType: string, event: any) {
    console.log('New ' + eventType + ' event received');
    this.node.log(eventType, JSON.stringify(event, null, '  '));
    if (this.onEventCb) {
      this.onEventCb(event);
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

    this.currentEventsubSubscriptions.push(this.listener.onStreamOnline(this.userId!, this.handleEvent.bind(this, 'streamOnline')));
    this.currentEventsubSubscriptions.push(this.listener.onStreamOffline(this.userId!, this.handleEvent.bind(this, 'streamOffline')));
    this.currentEventsubSubscriptions.push(this.listener.onChannelRedemptionAdd(this.userId!, this.handleEvent.bind(this, 'channelRedemptionAdd')));
    this.currentEventsubSubscriptions.push(this.listener.onChannelSubscription(this.userId!, this.handleEvent.bind(this, 'channelSubscription')));
    this.currentEventsubSubscriptions.push(this.listener.onChannelCheer(this.userId!, this.handleEvent.bind(this, 'channelCheer')));

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