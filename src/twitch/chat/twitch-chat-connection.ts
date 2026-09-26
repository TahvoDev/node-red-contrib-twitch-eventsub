import type { Node, NodeAPI } from 'node-red';
import { AbstractNode } from '../../AbstractNode';
import { ChatClient } from '@twurple/chat';
import type { ApiClient } from '@twurple/api';
import {
  type ChatAccount,
  type ChatConnectionConfig,
  type ChatStatus,
  parseChannels,
} from './twitch-chat-base';

module.exports = function (RED: NodeAPI) {

  /**
   * Owns the single ChatClient shared by every chat node wired to it. Auth comes
   * from the referenced twitch-api-config node, so the chat nodes never see the
   * credentials themselves.
   */
  class TwitchChatConnection extends AbstractNode {
    config: ChatConnectionConfig;
    account?: ChatAccount;
    chatClient?: ChatClient;
    currentStatus: ChatStatus = { fill: 'grey', shape: 'ring', text: 'Disconnected' };

    private listeners: { [key: string]: Node } = {};
    private initPromise?: Promise<ChatClient | undefined>;

    constructor(config: ChatConnectionConfig) {
      super(config, RED);
      this.config = config;
      this.account = RED.nodes.getNode(config.account ?? '') as unknown as ChatAccount | undefined;

      if (!this.account) {
        this.updateStatus({ fill: 'red', shape: 'ring', text: 'No Twitch account configured' });
      } else {
        this.initChat().catch((e) => this.error(e));
      }

      // Tear the IRC connection down on redeploy/removal or it leaks.
      this.on('close', (done: () => void) => {
        this.chatClient?.quit();
        this.chatClient = undefined;
        this.listeners = {};
        this.currentStatus = { fill: 'grey', shape: 'ring', text: 'Disconnected' };
        done();
      });
    }

    initChat(): Promise<ChatClient | undefined> {
      if (this.chatClient) return Promise.resolve(this.chatClient);
      if (this.initPromise) return this.initPromise;

      this.initPromise = this.doInitChat().finally(() => {
        this.initPromise = undefined;
      });
      return this.initPromise;
    }

    private async doInitChat(): Promise<ChatClient | undefined> {
      if (!this.account) return undefined;

      this.updateStatus({ fill: 'yellow', shape: 'ring', text: 'Connecting...' });
      await this.account.initAuth();

      // The config node exposes its AuthProvider directly; reusing that instance
      // avoids building a second refreshing provider that would fight over the
      // rotating refresh token.
      const authProvider = this.account.getAuthProvider();
      if (!authProvider) {
        this.updateStatus({ fill: 'yellow', shape: 'ring', text: 'Waiting for Twitch auth' });
        return undefined;
      }

      const userId = this.getUserId();
      const client = new ChatClient({
        authProvider,
        channels: parseChannels(this.config.channels),
        rejoinChannelsOnReconnect: true,
        // "known" is Twitch's rate-limit tier for a registered bot account.
        botLevel: this.config.isBot ? 'known' : 'none',
        // The config node registers its user token under an intent named after the
        // user id, not "chat", so point the client at that intent explicitly.
        authIntents: userId ? [userId] : undefined,
      });

      client.onConnect(() => this.updateStatus({ fill: 'green', shape: 'dot', text: 'Connected' }));
      client.onDisconnect(() => this.updateStatus({ fill: 'yellow', shape: 'ring', text: 'Reconnecting' }));
      client.onAuthenticationFailure((text: string) =>
        this.updateStatus({ fill: 'red', shape: 'ring', text: `Disconnected: ${text}` })
      );

      this.chatClient = client;
      client.connect();
      return client;
    }

    getChatClient(): ChatClient | undefined {
      return this.chatClient;
    }

    getApiClient(): ApiClient | undefined {
      return this.account?.apiClient;
    }

    getUserId(): string | undefined {
      return this.account?.userId ?? this.account?.config?.twitch_user_id;
    }

    addListener(id: string, node: Node) {
      this.listeners[id] = node;
      node.status(this.currentStatus);
      this.initChat().catch((e) => this.error(e));
    }

    removeListener(id: string) {
      delete this.listeners[id];
    }

    updateStatus(status: ChatStatus) {
      this.currentStatus = status;
      this.status(status);
      Object.values(this.listeners).forEach((node) => node.status(status));
    }
  }

  RED.nodes.registerType('twitch-chat-connection', TwitchChatConnection as any);
};
