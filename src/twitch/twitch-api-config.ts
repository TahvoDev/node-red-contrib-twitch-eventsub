import type {Red} from '../Red';
import { AbstractNode } from '../AbstractNode';
import {TwitchEventsub} from './twitch-eventsub-service';

type TwitchEventsubConfigProps = {
  broadcaster_id: number;
  twitch_client_id: string;
  twitch_client_secret: string;
  twitch_auth_token: string;
  twitch_refresh_token: string;
}

type Status = {
  fill: 'red' | 'green' | 'yellow' | 'blue' | 'grey';
  shape: 'ring' | 'dot';
  text: string;
}

module.exports = function (RED: Red) {
  // --- NEW: API Endpoints for Device Code Flow ---
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
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const data = await response.json();
        
        if (!response.ok) {
             throw new Error(JSON.stringify(data));
        }
        res.json(data);
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
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
          });

          const data = await response.json();
          
          if (!response.ok) {
              // 400 is expected while waiting for user (authorization_pending)
              res.status(response.status).json(data); 
          } else {
              res.json(data);
          }
      } catch (error) {
          res.status(500).send({ error: (error as Error).message });
      }
  });
  // -----------------------------------------------

  class TwitchEventsubConfig extends AbstractNode {
    config: TwitchEventsubConfigProps;
    twitchEventsub: TwitchEventsub;
    nodeListeners: {[key: string]: Node} = {};
    currentStatus: Status = {
      fill: 'grey',
      shape: 'ring',
      text: 'Connecting...',
    };
    initialized: boolean = false;

    constructor(config: TwitchEventsubConfigProps) {
      super(config, RED);
      this.config = config;
      this.twitchEventsub = new TwitchEventsub(
        this,
        config.broadcaster_id,
        config.twitch_client_id,
        config.twitch_client_secret
      );
      this.on('close', (done: () => void) => {
        this.takedown().then(done);
      });
    }

    init() {
      this.twitchEventsub.init(this.config.twitch_refresh_token)
        .then(async () => {
          this.log('Twitch auth success; adding subscriptions');
          this.updateStatus({
            fill: 'green',
            shape: 'ring',
            text: 'Subscribing to events...',
          });
          this.twitchEventsub.onEventCb = (e, subscriptionType) => {
            Object.values(this.nodeListeners).forEach(node => {
              (node as any).triggerTwitchEvent(e, subscriptionType);
            });
          };

          try {
            await this.twitchEventsub.addSubscriptions();
            this.log('Subscriptions added');
            this.updateStatus({
              fill: 'green',
              shape: 'dot',
              text: `Ready`,
            });
          }
          catch(e) {
            this.updateStatus({
              fill: 'red',
              shape: 'dot',
              text: `Subscriptions failed: ${(e as Error).message}`,
            });
          }
        })
        .catch((e: Error) => {
          this.error(`TwitchEventsubConfig: auth failed`);
          this.updateStatus({
            fill: 'red',
            shape: 'ring',
            text: `Twitch auth failed`,
          });
        });
      this.initialized = true;
    }

    async takedown() {
      this.log('Stopping twitch event listener');
      await this.twitchEventsub.stop();
      this.updateStatus({
        fill: 'grey',
        shape: 'ring',
        text: 'Disconnected',
      });
      this.initialized = false;
      this.log('Stopped twitch event listener');
    }

    updateStatus(status: Status) {
      if (status.fill === 'red') {
        console.error(status.text);
      }
      this.currentStatus = status;
      Object.values(this.nodeListeners).forEach(node => {
        (node as any).status(status);
      });
    }

    addNode(id: string, node: Node): void {
      this.log(`addNode ${id}`);
      this.nodeListeners[id] = node;
      (node as any).status(this.currentStatus);
      if (!this.initialized) {
        this.init();
      }
    }

    async removeNode(id: string, done: () => void): Promise<void> {
      delete this.nodeListeners[id];
      if (Object.keys(this.nodeListeners).length === 0) {
        await this.takedown();
      }
      done();
    }
  }

  RED.nodes.registerType('twitch-api-config', TwitchEventsubConfig);
}