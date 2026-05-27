import type { NodeAPI } from 'node-red';
import { AbstractNode } from '../AbstractNode';
import { RefreshingAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { TwitchEventsubService } from './eventsub/twitch-eventsub-service';

type TwitchApiConfigProps = {
  id: string;
  twitch_client_id: string;
  twitch_user_id?: string;
  twitch_user_login?: string;
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
    eventsubService?: TwitchEventsubService;
    nodeListeners: { [key: string]: any } = {};
    currentStatus: Status = { fill: 'grey', shape: 'ring', text: 'Connecting...' };
    authReady = false;

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

        this.apiClient = new ApiClient({ authProvider });
        this.authReady = true;
        this.log('Auth ready');
        this.updateStatus({ fill: 'green', shape: 'ring', text: 'Auth ready' });
      } catch (e: any) {
        this.updateStatus({ fill: 'red', shape: 'ring', text: `Auth failed: ${e.message}` });
        throw e;
      }
    }

    async initEventsub(): Promise<void> {
      if (this.eventsubService || !this.apiClient) return;

      this.eventsubService = new TwitchEventsubService(
        this,
        this.config.twitch_user_id!,
        this.apiClient
      );

      this.eventsubService.onEventCb = (e, subscriptionType) => {
        Object.values(this.nodeListeners).forEach((node) => {
          node.triggerTwitchEvent(e, subscriptionType);
        });
      };

      this.updateStatus({ fill: 'green', shape: 'ring', text: 'Subscribing to events...' });
      await this.eventsubService.start();
      this.updateStatus({
        fill: 'green',
        shape: 'dot',
        text: `Logged in as ${this.config.twitch_user_login ?? 'unknown'}`,
      });
    }

    async takedown() {
      if (this.eventsubService) {
        await this.eventsubService.stop();
        this.eventsubService = undefined;
      }
      this.apiClient = undefined;
      this.authReady = false;
      this.updateStatus({ fill: 'grey', shape: 'ring', text: 'Disconnected' });
    }

    updateStatus(status: Status) {
      this.currentStatus = status;
      Object.values(this.nodeListeners).forEach((node) => {
        node.status(status);
      });
    }

    addNode(id: string, node: any, subscriptionType: string) {
      this.nodeListeners[id] = node;
      node.status(this.currentStatus);
      this.initAuth()
      .then(async () => {
        if (!this.eventsubService) await this.initEventsub();
        this.eventsubService?.addSubscription(subscriptionType);
      })
      .catch((e) => this.updateStatus({ fill: 'red', shape: 'ring', text: e.message }));
    }

    async removeNode(id: string, subscriptionType: string, done: () => void) {
      this.eventsubService?.removeSubscription(subscriptionType);
      delete this.nodeListeners[id];
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
