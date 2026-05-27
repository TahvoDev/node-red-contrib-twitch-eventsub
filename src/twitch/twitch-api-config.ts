import type { NodeAPI } from 'node-red';
import { AbstractNode } from '../AbstractNode';
import { TwitchEventsub } from './twitch-eventsub-service';

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
      const data = await response.json();
      res.status(response.status).json(data);
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
    if (!res.ok || !json.data?.length) {
      throw new Error('Failed to fetch Twitch user');
    }
    return { id: json.data[0].id as string, login: json.data[0].login as string };
  }

  // --- Config node ---

  class TwitchApiConfig extends AbstractNode {
    config: TwitchApiConfigProps;
    credentials: TwitchApiCredentials;
    twitchEventsub?: TwitchEventsub;
    nodeListeners: { [key: string]: Node } = {};
    currentStatus: Status = { fill: 'grey', shape: 'ring', text: 'Connecting...' };
    initialized = false;

    constructor(config: TwitchApiConfigProps) {
      super(config, RED);
      this.config = config;
      this.credentials = RED.nodes.getCredentials(config.id) as TwitchApiCredentials;

      this.on('close', (done: () => void) => {
        this.initialized = false;
        this.takedown().then(done);
      });
    }

    init() {
      if (this.initialized) return;

      const { twitch_refresh_token, twitch_client_secret } = this.credentials ?? {};

      if (!twitch_refresh_token || !this.config.twitch_user_id) {
        this.updateStatus({ fill: 'yellow', shape: 'ring', text: 'Waiting for Twitch login…' });
        return;
      }

      if (!this.twitchEventsub) {
        this.twitchEventsub = new TwitchEventsub(
          this,
          this.config.twitch_user_id,
          this.config.twitch_client_id,
          twitch_client_secret
        );
      }

      this.twitchEventsub
      .init(twitch_refresh_token)
      .then(async () => {
        this.initialized = true;
        this.updateStatus({ fill: 'green', shape: 'ring', text: 'Subscribing to events...' });

        this.twitchEventsub!.onEventCb = (e, subscriptionType) => {
          Object.values(this.nodeListeners).forEach((node) => {
            (node as any).triggerTwitchEvent(e, subscriptionType);
          });
        };

        await this.twitchEventsub!.addSubscriptions();
        this.updateStatus({
          fill: 'green',
          shape: 'dot',
          text: `Logged in as ${this.config.twitch_user_login ?? 'unknown'}`,
        });
      })
      .catch((e: Error) => {
        this.updateStatus({ fill: 'red', shape: 'ring', text: `Auth failed: ${e.message}` });
      });
    }

    async takedown() {
      if (this.twitchEventsub) {
        await this.twitchEventsub.stop();
        this.twitchEventsub = undefined;
      }
      this.updateStatus({ fill: 'grey', shape: 'ring', text: 'Disconnected' });
      this.initialized = false;
    }

    updateStatus(status: Status) {
      this.currentStatus = status;
      Object.values(this.nodeListeners).forEach((node) => {
        (node as any).status(status);
      });
    }

    addNode(id: string, node: Node) {
      this.nodeListeners[id] = node;
      (node as any).status(this.currentStatus);
      this.init();
    }

    async removeNode(id: string, done: () => void) {
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
