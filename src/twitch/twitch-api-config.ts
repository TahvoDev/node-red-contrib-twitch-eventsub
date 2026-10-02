import type { Node, NodeAPI } from 'node-red';
import { RefreshingAuthProvider, type AuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { TwitchEventsubService } from './eventsub/twitch-eventsub-service';
import { MockAuthProvider } from './mock-auth-provider';
import { HELIX_SPECS } from './helix/specs';
import {
  effectiveFields,
  specScopes,
  specTier,
  defaultActionName,
  type HelixAction,
  type HelixField,
  type HelixSpec,
} from './helix/define';
import { enabledTiers } from './helix/helix-core';
import { shortStatus } from './helix/twitch-helix-utils';

/** A field reduced to the metadata the twitch-api editor needs. */
function serializeField(field: HelixField) {
  return {
    name: field.name,
    label: field.label,
    kind: field.kind,
    default: field.default,
    hint: field.hint,
    options: field.options,
    required: field.required,
    primary: field.primary,
    aliases: field.aliases,
    faIcon: field.faIcon,
  };
}

function serializeAction(spec: HelixSpec, action: HelixAction) {
  // Shared fields are on the endpoint, so an action only carries its own.
  return {
    label: action.label,
    help: action.help,
    fields: effectiveFields({ ...spec, fields: [] } as HelixSpec, action)
      .filter((field) => !field.hidden)
      .map(serializeField),
  };
}

function serializeEndpoint(spec: HelixSpec) {
  const actions = spec.actions
    ? Object.fromEntries(
        Object.entries(spec.actions).map(([name, action]) => [name, serializeAction(spec, action)])
      )
    : undefined;

  return {
    type: spec.type,
    label: spec.label,
    help: spec.help,
    tier: specTier(spec),
    fields: effectiveFields(spec)
      .filter((field) => !field.hidden)
      .map(serializeField),
    actions,
    defaultAction: defaultActionName(spec),
  };
}

type TwitchApiConfigProps = {
  id: string;
  twitch_client_id: string;
  twitch_user_id?: string;
  twitch_user_login?: string;
  twitch_mock_server_port?: string;
  twitch_mock_user_id?: string;
  twitch_mock_token?: string;
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

// Scopes used by the EventSub and chat nodes plus the base Twitch login. The
// Helix node scopes are appended from what the specs declare (generated at build
// time), so authorising once covers the whole palette without a hand-kept list.
const CORE_SCOPES = [
  'bits:read', 'channel:edit:commercial', 'channel:manage:ads', 'channel:manage:broadcast',
  'channel:manage:moderators', 'channel:manage:polls', 'channel:manage:predictions',
  'channel:manage:raids', 'channel:manage:redemptions', 'channel:manage:schedule',
  'channel:manage:videos', 'channel:manage:vips', 'channel:moderate',
  'channel:read:ads', 'channel:read:charity', 'channel:read:emotes', 'channel:read:goals',
  'channel:read:guest_star', 'channel:read:hype_train', 'channel:read:polls',
  'channel:read:predictions', 'channel:read:redemptions', 'channel:read:stream_key',
  'channel:read:subscriptions', 'channel:read:vips',
  'chat:read', 'chat:edit', 'clips:edit',
  'moderation:read', 'moderator:manage:announcements', 'moderator:manage:banned_users',
  'moderator:manage:blocked_terms', 'moderator:manage:chat_messages',
  'moderator:manage:chat_settings', 'moderator:manage:shoutouts',
  'moderator:manage:unban_requests', 'moderator:manage:warnings',
  'moderator:read:automod_settings',
  'moderator:read:blocked_terms', 'moderator:read:chat_settings',
  'moderator:read:chatters', 'moderator:read:followers', 'moderator:read:guest_star',
  'moderator:read:shield_mode', 'moderator:read:shoutouts',
  'moderator:read:suspicious_users', 'moderator:read:unban_requests',
  'moderator:read:whispers',
  'user:edit', 'user:edit:broadcast', 'user:read:blocked_users',
  'user:read:broadcast', 'user:read:chat', 'user:read:email', 'user:read:follows',
  'user:read:subscriptions', 'user:write:chat', 'user:manage:blocked_users',
  'user:manage:whispers',
];

// Every scope the Helix registry can need, plus the EventSub/chat ones above.
// Fixed at startup so a tier change never forces a re-login.
const HELIX_SPEC_SCOPES = [...new Set(HELIX_SPECS.flatMap((spec) => specScopes(spec)))].sort();

// A mock server never validates tokens, but Twurple checks the scopes on the
// token it is given and falls back to the real validate endpoint when the scope
// list is unknown, so the mock provider has to claim a full set up front.
const MOCK_SCOPES = [...new Set([...CORE_SCOPES, ...HELIX_SPEC_SCOPES])].sort();

/**
 * Status vocabulary, following core's MQTT node (10-mqtt.js:414-422): a ring is
 * not connected, a dot is, so green only ever appears with a dot. The editor
 * reads this same text back out of the retained status/<id> message, so the
 * wording here is also the wording the config dialog shows.
 */
const STATUS = {
  idle: { fill: 'grey', shape: 'ring', text: 'Not connected' },
  waitingLogin: { fill: 'yellow', shape: 'ring', text: 'Waiting for Twitch login…' },
  connecting: { fill: 'yellow', shape: 'ring', text: 'Connecting…' },
  subscribing: { fill: 'yellow', shape: 'ring', text: 'Subscribing to events…' },
  reauthNeeded: { fill: 'red', shape: 'ring', text: 'Re-authenticate needed' },
  badClientSecret: { fill: 'red', shape: 'ring', text: 'Check client secret' },
  gaveUp: { fill: 'red', shape: 'ring', text: 'Gave up — redeploy' },
} as const;

/** The one green status, and it wears a dot: the token works and EventSub is up. */
const connectedStatus = (user: string): Status => ({
  fill: 'green',
  shape: 'dot',
  text: `Connected as ${user}`,
});

/** Deliberately not a countdown: that would publish a status message a second
 * at a time over comms for no new information. */
const reconnectingStatus = (attempt: number): Status => ({
  fill: 'yellow',
  shape: 'ring',
  text: `Reconnecting (attempt ${attempt})`,
});

/**
 * Why a token refresh failed. Twitch answers 400 for both "invalid refresh
 * token" and "invalid client", and only the body separates them: a revoked token
 * needs the user to log in again, a wrong client secret needs neither a retry
 * nor a re-login, and anything unclassifiable is worth another go.
 *
 * ponytail: matches Twitch's own error wording, so reworded text would send a
 * revoked token round the retry ladder. Switch on status codes alone if that
 * ever happens.
 */
function classifyRefreshFailure(e: any): 'bad-secret' | 'revoked' | 'transient' {
  const code = e?.statusCode;
  if (code === 429) return 'transient'; // rate limited, so back off rather than stop
  if (code === 400 || code === 401) {
    return /invalid client/i.test(String(e?.body ?? '')) ? 'bad-secret' : 'revoked';
  }
  return 'transient'; // no status code means the request never got an answer
}

// 15s, 30s, 60s, then every 5 minutes. Twenty attempts is about 90 minutes,
// after which a redeploy is cheaper than more waiting.
const RETRY_DELAYS = [15_000, 30_000, 60_000];
const RETRY_CAP = 300_000;
const MAX_RETRY_ATTEMPTS = 20;

function retryDelay(attempt: number): number {
  const base = RETRY_DELAYS[attempt - 1] ?? RETRY_CAP;
  // Jitter, so config nodes that lost the network together do not retry in step.
  return Math.round(base * (0.9 + Math.random() * 0.2));
}

module.exports = function (RED: NodeAPI) {

  // Every scope a user could need, for the editor's Login with Twitch button.
  RED.httpAdmin.get('/twitch-eventsub/helix/scopes', (_req: any, res: any) => {
    res.json({ scopes: MOCK_SCOPES });
  });

  // The endpoint picker for the twitch-api node: every registry entry in an
  // enabled tier.
  RED.httpAdmin.get('/twitch-eventsub/helix/endpoints', (_req: any, res: any) => {
    const tiers = enabledTiers((RED as any).settings);
    const endpoints = HELIX_SPECS.filter((spec) => tiers.indexOf(specTier(spec)) !== -1).map(
      serializeEndpoint
    );
    res.json({ tiers, endpoints });
  });

  // --- Auth endpoints for Device Code Flow ---

  // The device flow only needs a client id, so a wrong client secret would
  // otherwise not surface until the first runtime token refresh. The
  // client_credentials grant is the cheapest way to check the pair up front.
  RED.httpAdmin.post('/twitch-eventsub/auth/verify', async (req: any, res: any) => {
    const { client_id, client_secret } = req.body;
    if (!client_id || !client_secret) {
      res.status(400).json({ error: 'Missing client_id or client_secret' });
      return;
    }
    try {
      const params = new URLSearchParams({
        client_id,
        client_secret,
        grant_type: 'client_credentials',
      });
      const response = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        body: params,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        // The editor waits on this one behind a button, so a hung call would leave
        // it stuck on "Checking credentials…" forever.
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        // Pass the status through: the editor reads 400 and 401 as a bad pair and
        // anything else as a connectivity problem, so the status has to survive.
        res.status(response.status).json({
          error:
            response.status === 400 || response.status === 401
              ? 'Client ID or Client Secret is not valid'
              : `Twitch returned ${response.status}`,
        });
        return;
      }
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

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

  // Merged with the class below to add the Node-RED runtime members (on/status/
  // log/error/…) that createNode copies onto the instance.
  interface TwitchApiConfig extends Node {}

  class TwitchApiConfig {
    config: TwitchApiConfigProps;
    credentials: TwitchApiCredentials;
    apiClient?: ApiClient;
    private authProvider?: AuthProvider;
    eventsubService?: TwitchEventsubService;
    // Null-prototype maps: the keys are node ids, and a plain object would let a
    // key like "__proto__" resolve to Object.prototype.
    // The user nodes, with the event each one registered. The types are kept here
    // because the service clears its own counts on stop(), so a service rebuilt
    // after an auth failure would otherwise come back with no subscriptions.
    nodeListeners: { [key: string]: { node: any; type: string } } = Object.create(null);
    currentStatus: Status = { ...STATUS.idle };
    authReady = false;
    userId?: string;
    mockServerPort?: number;

    private authInitPromise?: Promise<void>;
    private retryTimer?: ReturnType<typeof setTimeout>;
    private retryAttempt = 0;
    // Bumped on close. An initAuth() that is still awaiting Twitch when the node
    // closes must not revive it, so every await checks this against its own copy.
    private generation = 0;
    private closed = false;
    // Set by handleAuthFailure: it has already reported the failure as a terminal
    // status or a retry. Callers catching that same error must not overwrite it.
    private authFailureReported = false;

    constructor(config: TwitchApiConfigProps) {
      RED.nodes.createNode(this as any, config as any);
      this.config = config;
      this.credentials = RED.nodes.getCredentials(config.id) as TwitchApiCredentials;

      this.on('close', (done: () => void) => {
        this.shutdown().then(done);
      });
    }

    async initAuth(): Promise<void> {
      if (this.authReady) return;
      if (this.closed) return;
      if (this.authInitPromise) return this.authInitPromise;

      this.authInitPromise = this._doAuth().finally(() => {
        this.authInitPromise = undefined;
      });

      return this.authInitPromise;
    }

    private async _doAuth(): Promise<void> {
      this.authFailureReported = false;
      const mockPort = this.parseMockServerPort();

      if (mockPort) {
        await this._initMockAuth(mockPort);
        return;
      }

      const { twitch_refresh_token, twitch_client_secret } = this.credentials ?? {};

      if (!twitch_refresh_token || !this.config.twitch_user_id) {
        this.updateStatus(STATUS.waitingLogin);
        return;
      }

      this.updateStatus(STATUS.connecting);
      const generation = this.generation;

      try {
        const authProvider = new RefreshingAuthProvider({
          clientId: this.config.twitch_client_id,
          clientSecret: twitch_client_secret,
        });

        authProvider.onRefreshFailure((_userId: string, error: Error) => {
          // The ladder builds a fresh provider after a failure, and anything still
          // holding the old one — an ApiClient, an EventSub listener, a chat
          // connection — can emit here again. That must not tear down the healthy
          // provider which replaced it. authProvider is still unset during
          // addUserForToken below, and that failure is reported by the catch.
          if (this.authProvider && this.authProvider !== authProvider) return;

          this.authReady = false;
          this.authProvider = undefined;
          this.apiClient = undefined;
          this.handleAuthFailure(error);
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

        // A redeploy while Twitch was answering leaves this node dead; assigning
        // the provider now would publish a connected status for a closed node.
        if (this.closed || generation !== this.generation) return;

        this.userId = this.config.twitch_user_id;
        this.authProvider = authProvider;
        this.apiClient = new ApiClient({ authProvider });
        this.authReady = true;
        this.log('Auth ready');
      } catch (e: any) {
        // shutdown() bumps the generation, so this is also the closed check: a
        // failure that lands after a close has nothing left to report to.
        if (generation === this.generation) this.handleAuthFailure(e);
        throw e;
      }
    }

    /**
     * The single place that decides what a failed token means, so a revoked token
     * at startup is not retried 20 times. Anything terminal clears the provider and
     * stops; anything unclassified goes back on the ladder.
     */
    private handleAuthFailure(e: any) {
      // onRefreshFailure can fire while shutdown() is tearing the node down, and a
      // red status on a node that is already gone tells the editor nothing.
      if (this.closed) return;

      const kind = classifyRefreshFailure(e);
      this.authFailureReported = true;

      if (kind === 'bad-secret') {
        this.clearRetry();
        this.dropAuth();
        this.warn(`Twitch rejected the client secret: ${shortStatus(e?.message ?? '')}`);
        this.updateStatus(STATUS.badClientSecret);
        return;
      }

      if (kind === 'revoked') {
        this.clearRetry();
        this.dropAuth();
        this.warn(`Twitch rejected the refresh token: ${shortStatus(e?.message ?? '')}`);
        this.updateStatus(STATUS.reauthNeeded);
        return;
      }

      this.scheduleRetry();
    }

    /**
     * Terminal auth failure. The EventSub service has to go with the provider: its
     * listener holds the ApiClient that just failed, so leaving it running keeps
     * Twuple refreshing against a provider that is already known-bad, and every one
     * of those attempts emits a failure at a node that has already reported red.
     */
    private dropAuth() {
      this.authReady = false;
      this.authProvider = undefined;
      this.apiClient = undefined;
      if (!this.eventsubService) return;
      const service = this.eventsubService;
      this.eventsubService = undefined;
      service.stop().catch(() => {});
    }

    private scheduleRetry() {
      if (this.closed) return;

      if (this.retryAttempt >= MAX_RETRY_ATTEMPTS) {
        this.warn(`Gave up after ${MAX_RETRY_ATTEMPTS} attempts to reach Twitch; redeploy to try again`);
        this.updateStatus(STATUS.gaveUp);
        return;
      }

      this.retryAttempt += 1;
      this.updateStatus(reconnectingStatus(this.retryAttempt));

      // Only the newest timer is tracked, so a pending one from an earlier failure
      // would survive close() and keep this node's auth alive after its deploy.
      this.clearRetryTimer();
      this.retryTimer = setTimeout(() => {
        this.retryTimer = undefined;
        this.retryAuth();
      }, retryDelay(this.retryAttempt));
    }

    /**
     * Retrying has to go back through initAuth: Twurple records a failed refresh
     * per user and then throws CachedRefreshFailureError without trying again
     * (RefreshingAuthProvider.ts:231), and only addUserForToken clears it (:68).
     */
    private async retryAuth() {
      try {
        await this.initAuth();
      } catch {
        // initAuth already set the next retry or a terminal status.
        return;
      }

      // Deliberate asymmetry: the retry ladder is for auth, where Twitch decides
      // whether a later attempt can succeed and backoff is the right answer. An
      // EventSub setup failure is reported red and not retried, because the usual
      // causes (bad secret, no subscriptions for this app) need the user, not
      // time. The ladder does resume from the next auth failure either way.
      try {
        await this.rebuildEventsub();
      } catch (e: any) {
        // Auth is fine here, so this is a plain EventSub failure and nothing has
        // reported it yet.
        this.handleEventsubFailure(e);
        return;
      }

      // Only a service that actually came back up clears the counter. initAuth and
      // initEventsub both return immediately once closed, so this only resets the
      // count; no guard is needed to stop a closed node reporting progress.
      this.retryAttempt = 0;
    }

    /**
     * A failed refresh poisons that auth provider for the user (Twurple keeps the
     * failure in _cachedRefreshFailures and only addUserForToken on that same
     * instance clears it), and a running service still holds the old ApiClient
     * through its EventSubWsListener. Reusing it would leave the node green while
     * every resubscribe threw CachedRefreshFailureError, so the service is stopped
     * and rebuilt against the ApiClient initAuth() just created.
     */
    private async rebuildEventsub() {
      if (this.eventsubService) {
        await this.eventsubService.stop();
        this.eventsubService = undefined;
      }

      await this.initEventsub();

      Object.values(this.nodeListeners).forEach(({ type }) => {
        this.eventsubService?.addSubscription(type);
      });
    }

    private clearRetryTimer() {
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = undefined;
      }
    }

    private clearRetry() {
      this.clearRetryTimer();
      this.retryAttempt = 0;
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
          MOCK_SCOPES,
          this.config.twitch_mock_token || undefined
        );

        this.userId = userId;
        this.mockServerPort = mockPort;
        this.authProvider = authProvider;
        this.apiClient = new ApiClient({ authProvider, mockServerPort: mockPort });
        this.authReady = true;
        this.log(`Mock server on port ${mockPort} as user ${userId}`);
        this.updateStatus({ fill: 'blue', shape: 'ring', text: `Mock server ${mockPort}` });
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
        Object.values(this.nodeListeners).forEach(({ node }) => {
          node.triggerTwitchEvent(e, subscriptionType);
        });
      };

      this.updateStatus(STATUS.subscribing);
      try {
        await this.eventsubService.start();
      } catch (e) {
        // start() can throw with the listener half-wired. Stopping it first releases
        // that socket; then dropping it means a later attempt rebuilds, instead of
        // the early return above skipping a retry that would leave the nodes
        // silently unsubscribed.
        await this.eventsubService.stop().catch(() => {});
        this.eventsubService = undefined;
        throw e;
      }
      this.updateStatus(connectedStatus(this.describeUser()));
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

    /**
     * The node is being unloaded: nothing may set a status or revive the provider
     * afterwards, and no retry timer survives. Separate from takedown(), which
     * removeNode() also calls while the node stays deployed and usable again.
     */
    async shutdown() {
      this.closed = true;
      this.generation += 1;
      this.clearRetry();
      await this.takedown();
    }

    async takedown() {
      if (this.eventsubService) {
        await this.eventsubService.stop();
        this.eventsubService = undefined;
      }
      this.apiClient = undefined;
      this.authProvider = undefined;
      this.authReady = false;

      // shutdown() has already set closed, and nothing may publish after that: the
      // node is on its way out and there is nothing left to read a status. It is
      // removeNode() that lands here with the config still deployed and usable, and
      // its honest state is the one a config nothing uses already has: idle.
      if (this.closed) return;
      this.updateStatus(STATUS.idle);
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
      // Publish for the editor, as any node's own lifecycle nodes do. The extra bit
      // is the retained shape: the editor reads fill and shape back out of this
      // message, so the workspace badge follows the same vocabulary as the dialog.
      this.status(status);
      this.pushStatusToListeners(status);
    }

    /** Mirrors this node's status to the EventSub nodes using it. Those nodes
     * report nothing of their own, and core's MQTT broker does the same for its
     * users (10-mqtt.js:414-419). Helix and chat nodes are deliberately not in
     * here: each reports its own lifecycle. */
    private pushStatusToListeners(status: Status) {
      Object.values(this.nodeListeners).forEach(({ node }) => node.status(status));
    }

    addNode(id: string, node: any, subscriptionType: string) {
      this.nodeListeners[id] = { node, type: subscriptionType };
      node.status(this.currentStatus);
      this.initAuth()
        .then(async () => {
          if (!this.eventsubService) await this.initEventsub();
          this.eventsubService?.addSubscription(subscriptionType);
        })
        .catch((e) => {
          // initAuth already classified the failure and set that status; only a
          // failure from the EventSub setup after it still needs reporting.
          if (!this.authFailureReported) this.handleEventsubFailure(e);
        });
    }

    /** An EventSub failure is not an auth failure: nothing has decided whether to
     * retry it, so it is reported as-is rather than hiding behind a stale
     * authReady/retryAttempt guess. */
    private handleEventsubFailure(e: any) {
      const text = shortStatus(e?.message ?? String(e));
      this.warn(`EventSub setup failed: ${text}`);
      this.updateStatus({ fill: 'red', shape: 'ring', text });
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

  // The status vocabulary and the retry policy, for test/unit/config-status.test.js.
  return { TwitchApiConfig, STATUS, connectedStatus, reconnectingStatus, classifyRefreshFailure, retryDelay, MAX_RETRY_ATTEMPTS };
};
