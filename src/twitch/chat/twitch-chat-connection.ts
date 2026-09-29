import type { Node, NodeAPI } from 'node-red';
import { ChatClient } from '@twurple/chat';
import type { ApiClient } from '@twurple/api';
import type { AuthProvider } from '@twurple/auth';
import {
  type ChatAccount,
  type ChatConnectionConfig,
  type ChatStatus,
  parseChannels,
} from './twitch-chat-base';
import { sanitizeStatus } from '../../security';

module.exports = function (RED: NodeAPI) {

  /**
   * Owns the single ChatClient shared by every chat node wired to it. Auth comes
   * from the referenced twitch-api-config node, so the chat nodes never see the
   * credentials themselves.
   */
  // Merged with the class below to add the Node-RED runtime members that
  // createNode copies onto the instance. `addListener`/`removeListener`/
  // `listeners` are dropped because this class shadows the EventEmitter ones.
  interface TwitchChatConnection extends Omit<Node, 'addListener' | 'removeListener' | 'listeners'> {}

  class TwitchChatConnection {
    config: ChatConnectionConfig;
    account?: ChatAccount;
    chatClient?: ChatClient;
    currentStatus: ChatStatus = { fill: 'grey', shape: 'ring', text: 'Disconnected' };

    private listeners = new Map<string, { node: Node; onClient?: (client: ChatClient) => void }>();
    private initPromise?: Promise<ChatClient | undefined>;

    constructor(config: ChatConnectionConfig) {
      RED.nodes.createNode(this as any, config);
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
        this.listeners.clear();
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

      // The config node exposes its AuthProvider directly; reusing that instance
      // avoids building a second refreshing provider that would fight over the
      // rotating refresh token.
      let authProvider: AuthProvider | undefined;
      try {
        await this.account.initAuth();
        authProvider = this.account.getAuthProvider();
      } catch (e) {
        // The config node reports auth failures only to its own EventSub listeners,
        // so without this the chat nodes stay stuck on "Connecting..." when auth
        // throws (bad refresh token, network down). Surface it and let the caller log.
        this.updateStatus({
          fill: 'red',
          shape: 'ring',
          text: sanitizeStatus(`Auth failed: ${(e as Error).message}`),
        });
        throw e;
      }

      if (!authProvider) {
        this.updateStatus({ fill: 'yellow', shape: 'ring', text: 'Waiting for Twitch auth' });
        return undefined;
      }

      const userId = this.getUserId();
      const client = new ChatClient({
        authProvider,
        channels: parseChannels(this.config.channels),
        rejoinChannelsOnReconnect: true,
        // Always identify as a bot so Twitch applies its bot rate limits rather
        // than the tighter anonymous-user ones.
        botLevel: 'known',
        // The config node registers its user token under an intent named after the
        // user id, not "chat", so point the client at that intent explicitly.
        authIntents: userId ? [userId] : undefined,
      });

      client.onConnect(() => this.updateStatus({ fill: 'green', shape: 'dot', text: 'Connected' }));
      client.onDisconnect(() => this.updateStatus({ fill: 'yellow', shape: 'ring', text: 'Reconnecting' }));
      client.onAuthenticationFailure((text: string) =>
        this.updateStatus({ fill: 'red', shape: 'ring', text: sanitizeStatus(`Disconnected: ${text}`) })
      );

      this.chatClient = client;
      // A client built after auth completed (the flow may be deployed before the
      // account is logged in) still has to reach listeners that registered early.
      this.notifyListeners(client);
      client.connect();
      return client;
    }

    private notifyListeners(client: ChatClient) {
      this.listeners.forEach((entry) => entry.onClient?.(client));
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

    addListener(id: string, node: Node, onClient?: (client: ChatClient) => void) {
      this.listeners.set(id, { node, onClient });
      node.status(this.currentStatus);

      if (this.chatClient) {
        onClient?.(this.chatClient);
        return;
      }
      this.initChat().catch((e) => this.error(e));
    }

    removeListener(id: string) {
      this.listeners.delete(id);
    }

    updateStatus(status: ChatStatus) {
      this.currentStatus = status;
      this.status(status);
      this.listeners.forEach((entry) => entry.node.status(status));
    }
  }

  RED.nodes.registerType('twitch-chat-connection', TwitchChatConnection as any);
};
