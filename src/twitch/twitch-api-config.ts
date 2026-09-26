import type { NodeAPI } from 'node-red';
import { AbstractNode } from '../AbstractNode';
import { RefreshingAuthProvider, type AuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { TwitchEventsubService } from './eventsub/twitch-eventsub-service';
import { MockAuthProvider } from './mock-auth-provider';

type TwitchApiConfigProps = {
  id: string;
  twitch_client_id: string;
  twitch_user_id?: string;
  twitch_user_login?: string;
  twitch_mock_server_port?: string;
  twitch_mock_user_id?: string;
};

type TwitchApiCredentials = {
  twitch_client_secret: string;
  twitch_refresh_token: string;
};

type Status = {
  fill: 'red' | 'green' | 'yellow' | 'blue' | 'grey';
  shape: 'ring' | 'dot';
  text: string;
};

// A mock server never validates tokens, but Twurple checks the scopes on the
// token it is given and falls back to the real validate endpoint when the scope
// list is unknown, so the mock provider has to claim a full set up front.
const MOCK_SCOPES = [
  'bits:read', 'channel:moderate', 'channel:read:ads', 'channel:read:charity',
  'channel:read:goals', 'channel:read:guest_star', 'channel:read:hype_train',
  'channel:read:polls', 'channel:read:predictions', 'channel:read:redemptions',
  'channel:read:subscriptions', 'channel:read:vips', 'chat:read', 'moderation:read',
  'moderator:manage:blocked_terms', 'moderator:manage:chat_messages',
  'moderator:manage:unban_requests', 'moderator:read:automod_settings',
  'moderator:read:blocked_terms', 'moderator:read:chat_settings',
  'moderator:read:followers', 'moderator:read:guest_star', 'moderator:read:shield_mode',
  'moderator:read:shoutouts', 'moderator:read:suspicious_users',
  'moderator:read:unban_requests', 'moderator:read:whispers',
  'user:edit', 'user:edit:broadcast', 'user:read:blocked_users',
  'user:read:broadcast', 'user:read:chat', 'user:read:email',
  'user:manage:blocked_users',
];

module.exports = function (RED: NodeAPI) {

  // --- Auth endpoints for Device Code Flow ---

  RED.httpAdmin.post('/twitch-eventsub/auth/device', async (req: any, res: any) => {
    const { client_id, scopes } = req.body;
    if (!client_id || !scopes) {
      res.status(400).json({ error: 'Missing client_id or scopes' });
      return;
    }
    try {
      const params = new URLSearchParams({ client_id, scopes });
      const response = await fetch('https://id.twitch.tv/oauth2/device', {
        method: 'POST',
        body: params,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      res.status(response.status).json(await response.json());
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  RED.httpAdmin.post('/twitch-eventsub/auth/token', async (req: any, res: any) => {
    const { client_id, device_code } = req.body;
    try {
      const params = new URLSearchParams({
        client_id,
        device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      });
      const response = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        body: params,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      const data = await response.json();
      if (!response.ok) {
        res.status(response.status).json(data);
        return;
      }
      const user = await fetchTwitchUser(data.access_token, client_id);
      res.json({ ...data, twitch_user_id: user.id, twitch_user_login: user.login });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  async function fetchTwitchUser(accessToken: string, clientId: string) {
    const res = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Client-Id': clientId,
      },
    });
    const json = await res.json();
    if (!res.ok || !json.data?.length) throw new Error('Failed to fetch Twitch user');
    return { id: json.data[0].id as string, login: json.data[0].login as string };
  }

  // --- Config node ---

  class TwitchApiConfig extends AbstractNode {
    config: TwitchApiConfigProps;
    credentials: TwitchApiCredentials;
    apiClient?: ApiClient;
    private authProvider?: AuthProvider;
    eventsubService?: TwitchEventsubService;
    nodeListeners: { [key: string]: any } = {};
    currentStatus: Status = { fill: 'grey', shape: 'ring', text: 'Connecting...' };
    authReady = false;
    userId?: string;
    mockServerPort?: number;
    nodeTypes: { [key: string]: string } = {};
    unsupportedNodes: Set<string> = new Set();

    private authInitPromise?: Promise<void>;

    constructor(config: TwitchApiConfigProps) {
      super(config, RED);
      this.config = config;
      this.credentials = RED.nodes.getCredentials(config.id) as TwitchApiCredentials;

      this.on('close', (done: () => void) => {
        this.takedown().then(done);
      });
    }

    async initAuth(): Promise<void> {
      if (this.authReady) return;
      if (this.authInitPromise) return this.authInitPromise;

      this.authInitPromise = this._doAuth().finally(() => {
        this.authInitPromise = undefined;
      });

      return this.authInitPromise;
    }

    private async _doAuth(): Promise<void> {
      const mockPort = this.parseMockServerPort();

      if (mockPort) {
        await this._initMockAuth(mockPort);
        return;
      }

      const { twitch_refresh_token, twitch_client_secret } = this.credentials ?? {};

      if (!twitch_refresh_token || !this.config.twitch_user_id) {
        this.updateStatus({ fill: 'yellow', shape: 'ring', text: 'Waiting for Twitch login…' });
        return;
      }

      try {
        const authProvider = new RefreshingAuthProvider({
          clientId: this.config.twitch_client_id,
          clientSecret: twitch_client_secret,
        });

        authProvider.onRefreshFailure(() => {
          this.authReady = false;
          this.authProvider = undefined;
          this.apiClient = undefined;
          this.updateStatus({ fill: 'red', shape: 'ring', text: 'Token refresh failed — re-authenticate' });
        });

        await authProvider.addUserForToken(
          {
            accessToken: '',
            refreshToken: twitch_refresh_token,
            expiresIn: 0,
            obtainmentTimestamp: 0,
          },
          [this.config.twitch_user_id]
        );

        this.userId = this.config.twitch_user_id;
        this.authProvider = authProvider;
        this.apiClient = new ApiClient({ authProvider });
        this.authReady = true;
        this.log('Auth ready');
        this.updateStatus({ fill: 'green', shape: 'ring', text: 'Auth ready' });
      } catch (e: any) {
        this.updateStatus({ fill: 'red', shape: 'ring', text: `Auth failed: ${e.message}` });
        throw e;
      }
    }

    private parseMockServerPort(): number | undefined {
      const raw = (this.config.twitch_mock_server_port ?? '').trim();
      if (!raw) return undefined;

      const port = Number(raw);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        this.updateStatus({ fill: 'red', shape: 'ring', text: `Bad mock server port: ${raw}` });
        return undefined;
      }

      return port;
    }

    private async _initMockAuth(mockPort: number): Promise<void> {
      const userId = this.config.twitch_mock_user_id || this.config.twitch_user_id;

      if (!userId) {
        this.updateStatus({ fill: 'yellow', shape: 'ring', text: 'Mock server needs a user ID' });
        return;
      }

      try {
        const authProvider = new MockAuthProvider(
          this.config.twitch_client_id || 'mock-client-id',
          userId,
          MOCK_SCOPES
        );

        this.userId = userId;
        this.mockServerPort = mockPort;
        this.authProvider = authProvider;
        this.apiClient = new ApiClient({ authProvider, mockServerPort: mockPort });
        this.authReady = true;
        this.log(`Mock server on port ${mockPort} as user ${userId}`);
        this.updateStatus({ fill: 'blue', shape: 'ring', text: `Mock server :${mockPort}` });
      } catch (e: any) {
        this.updateStatus({ fill: 'red', shape: 'ring', text: `Mock init failed: ${e.message}` });
        throw e;
      }
    }

    async initEventsub(): Promise<void> {
      if (this.eventsubService || !this.apiClient || !this.userId) return;

      this.eventsubService = new TwitchEventsubService(
        this,
        this.userId,
        this.apiClient
      );

      this.eventsubService.onEventCb = (e, subscriptionType) => {
        Object.values(this.nodeListeners).forEach((node) => {
          node.triggerTwitchEvent(e, subscriptionType);
        });
      };

      this.eventsubService.onUnsupportedCb = (subscriptionType) => {
        this.markUnsupported(subscriptionType);
      };

      this.updateStatus({ fill: 'green', shape: 'ring', text: 'Subscribing to events...' });
      await this.eventsubService.start();
      this.updateStatus({
        fill: 'green',
        shape: 'dot',
        text: `Logged in as ${this.describeUser()}`,
      });
    }

    /**
     * The login is empty for a mock config and the id is all a mock has, so fall back
     * to it rather than printing "Logged in as ".
     */
    private describeUser(): string {
      const login = (this.config.twitch_user_login ?? '').trim();
      const id = (this.userId ?? '').trim();

      if (this.mockServerPort) {
        return `${login || `mock user ${id || 'unknown'}`} (mock :${this.mockServerPort})`;
      }
      if (login && id) return `${login} (${id})`;
      return login || id || 'unknown user';
    }

    async takedown() {
      if (this.eventsubService) {
        await this.eventsubService.stop();
        this.eventsubService = undefined;
      }
      this.apiClient = undefined;
      this.authProvider = undefined;
      this.authReady = false;
      this.updateStatus({ fill: 'grey', shape: 'ring', text: 'Disconnected' });
    }

    /**
     * The token provider built from this node's credentials. Dependent nodes
     * (e.g. the chat connection) use it instead of reaching into the ApiClient.
     */
    getAuthProvider(): AuthProvider | undefined {
      return this.authProvider;
    }

    updateStatus(status: Status) {
      this.currentStatus = status;
      Object.entries(this.nodeListeners).forEach(([id, node]) => {
        if (!this.unsupportedNodes.has(id)) {
          node.status(status);
        }
      });
    }

    addNode(id: string, node: any, subscriptionType: string) {
      this.nodeListeners[id] = node;
      this.nodeTypes[id] = subscriptionType;
      node.status(this.currentStatus);
      this.initAuth()
        .then(async () => {
          if (!this.eventsubService) await this.initEventsub();
          this.eventsubService?.addSubscription(subscriptionType);
        })
        .catch((e) => this.updateStatus({ fill: 'red', shape: 'ring', text: e.message }));
    }

    markUnsupported(subscriptionType: string) {
      Object.entries(this.nodeTypes).forEach(([id, type]) => {
        if (type !== subscriptionType) return;
        this.unsupportedNodes.add(id);
        this.nodeListeners[id]?.status({
          fill: 'grey',
          shape: 'ring',
          text: 'Not available over WebSocket',
        });
      });
    }

    async removeNode(id: string, subscriptionType: string, done: () => void) {
      this.eventsubService?.removeSubscription(subscriptionType);
      delete this.nodeListeners[id];
      delete this.nodeTypes[id];
      this.unsupportedNodes.delete(id);
      if (Object.keys(this.nodeListeners).length === 0) {
        await this.takedown();
      }
      done();
    }
  }

  RED.nodes.registerType('twitch-api-config', TwitchApiConfig as any, {
    credentials: {
      twitch_client_secret: { type: 'password' },
      twitch_refresh_token: { type: 'password' },
    },
  });
};
