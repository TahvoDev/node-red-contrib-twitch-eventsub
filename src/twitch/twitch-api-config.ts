import type { Red } from '../Red';
import { AbstractNode } from '../AbstractNode';
import { TwitchEventsub } from './twitch-eventsub-service';

type TwitchEventsubConfigProps = {
  twitch_client_id: string;
  twitch_client_secret: string;
  twitch_auth_token: string;
  twitch_refresh_token: string;
  twitch_user_id?: string;
  twitch_user_login?: string;
};

type Status = {
  fill: 'red' | 'green' | 'yellow' | 'blue' | 'grey';
  shape: 'ring' | 'dot';
  text: string;
};

module.exports = function (RED: Red) {
  const REDAny = RED as any;

  // 1. Initiate Device Code Flow
  REDAny.httpAdmin.post('/twitch-eventsub/auth/device', async (req: any, res: any) => {
    const { client_id, scopes } = req.body;

    if (!client_id || !scopes) {
      res.status(400).send({ error: 'Missing client_id or scopes' });
      return;
    }

    try {
      const params = new URLSearchParams();
      params.append('client_id', client_id);
      params.append('scopes', scopes);

      const response = await fetch('https://id.twitch.tv/oauth2/device', {
        method: 'POST',
        body: params,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const data = await response.json();

      if (!response.ok) {
        res.status(response.status).json(data);
      } else {
        // ⚠️ device endpoint NEVER returns access_token
        res.json(data);
      }
    } catch (error) {
      res.status(500).send({ error: (error as Error).message });
    }
  });

  // 2. Poll for Token
  REDAny.httpAdmin.post('/twitch-eventsub/auth/token', async (req: any, res: any) => {
    const { client_id, device_code } = req.body;

    try {
      const params = new URLSearchParams();
      params.append('client_id', client_id);
      params.append('device_code', device_code);
      params.append('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');

      const response = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        body: params,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const data = await response.json();

      if (!response.ok) {
        // authorization_pending is expected while user approves
        res.status(response.status).json(data);
      } else {
        // ✅ access_token now exists — safe to fetch user
        const user = await fetchTwitchUser(data.access_token, client_id);
        res.json({
          ...data,
          twitch_user_id: user.id,
          twitch_user_login: user.login,
        });
      }
    } catch (error) {
      res.status(500).send({ error: (error as Error).message });
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

    return {
      id: json.data[0].id,
      login: json.data[0].login,
    };
  }

  class TwitchEventsubConfig extends AbstractNode {
    config: TwitchEventsubConfigProps;
    twitchEventsub?: TwitchEventsub;
    nodeListeners: { [key: string]: Node } = {};
    currentStatus: Status = {
      fill: 'grey',
      shape: 'ring',
      text: 'Connecting...',
    };
    initialized = false;
    pollingLogin = false;
    
    constructor(config: TwitchEventsubConfigProps) {
      super(config, RED);
      this.config = config;

      this.on('close', (done: () => void) => {
        this.initialized = false;
        this.takedown().then(done);
      });
    }


    init() {
      if (this.initialized) return;

      // 🚧 First login: no token yet
      if (!this.config.twitch_refresh_token || !this.config.twitch_user_id) {
        this.updateStatus({
          fill: 'yellow',
          shape: 'ring',
          text: 'Waiting for Twitch login…',
        });
        
        if (!this.config.twitch_refresh_token) {
          if (!this.pollingLogin) {
            this.pollingLogin = true;
            setTimeout(() => {
              this.pollingLogin = false;
              this.init();
            }, 2000);
          }
          return;
        }

        return;
      }

      if (!this.twitchEventsub) {
        this.twitchEventsub = new TwitchEventsub(
          this,
          this.config.twitch_user_id,
          this.config.twitch_client_id,
          this.config.twitch_client_secret
        );
      }

      this.twitchEventsub
        .init(this.config.twitch_refresh_token)
        .then(async () => {
          this.initialized = true;
          this.updateStatus({
            fill: 'green',
            shape: 'ring',
            text: 'Subscribing to events...',
          });

          this.twitchEventsub!.onEventCb = (e, subscriptionType) => {
            Object.values(this.nodeListeners).forEach((node) => {
              (node as any).triggerTwitchEvent(e, subscriptionType);
            });
          };

          await this.twitchEventsub!.addSubscriptions();

          this.updateStatus({
            fill: 'green',
            shape: 'ring',
            text: `Logged in as ${this.config.twitch_user_login ?? 'unknown'}`,
          });
        })
        .catch(() => {
          this.updateStatus({
            fill: 'red',
            shape: 'ring',
            text: 'Twitch auth failed',
          });
        });

    }

    async takedown() {
      if (this.twitchEventsub) {
        await this.twitchEventsub.stop();
        this.twitchEventsub = undefined;
      }
      this.updateStatus({
        fill: 'grey',
        shape: 'ring',
        text: 'Disconnected',
      });
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

  RED.nodes.registerType('twitch-api-config', TwitchEventsubConfig);
};
