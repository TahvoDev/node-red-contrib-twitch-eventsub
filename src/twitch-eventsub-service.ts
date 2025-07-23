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

class TwitchEventsub {
  clientId?: string | null;
  userId?: number | null;
  user!: HelixUser | null;
  authProvider: RefreshingAuthProvider;
  apiClient!: ApiClient;
  listener!: EventSubWsListener;
  node: AbstractNode;

  onEventCb?: (event: TwitchEvent) => void;

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
      console.log(`${e.userDisplayName} redeemed ${e.rewardTitle}`);

      this.node.log('channelRedemptionAdd', JSON.stringify(e, null, '  '));
      if (this.onEventCb) {
        this.onEventCb({
          eventType: 'channelRedemptionAdd',
          userId: this.userId!,
          userName: this.user?.name,
          userDisplayName: this.user?.displayName,
          rawEvent: e,
        });
      }
    });
  }


  async stop() {

  }
}

export { TwitchEventsub };