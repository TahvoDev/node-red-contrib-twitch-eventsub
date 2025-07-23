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

  onEventCb?: (event: string) => void;

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

  async addSubscriptions() {
    this.user = await this.apiClient.users.getUserById(this.userId!);

    this.listener.onChannelRedemptionAdd(this.userId!, e => {
      try {
        // Create a clean object with only the data we need
        const eventData = {
          id: e.id,
          userId: e.userId,
          userName: e.userName,
          userDisplayName: e.userDisplayName,
          rewardId: e.rewardId,
          rewardTitle: e.rewardTitle,
          rewardPrompt: e.rewardPrompt,
          rewardCost: e.rewardCost,
          status: e.status,
          redemptionDate: e.redemptionDate?.toISOString(),
          input: e.input
        };
        
        const eventJSON = JSON.stringify(eventData, null, 2);
        this.onEventCb?.(eventJSON);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.node.error(`Error processing redemption event: ${errorMessage}`, e);
      }
    });

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