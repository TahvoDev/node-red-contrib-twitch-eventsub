#!/usr/bin/env node
'use strict'

/**
 * Twitch API config status test.
 *
 * Covers the three things that are easy to break quietly: the status vocabulary
 * (Node-RED reserves the green dot for connected, so a green ring is a bug), the
 * classification of a failed token refresh (a revoked token must not be retried,
 * and a network blip must be), and the retry timer surviving a close.
 * No framework: it runs against the built dist/ output, and any failed assert
 * throws and exits non-zero, failing `npm run test:unit`, `npm run check` and
 * `npm run build`.
 */

const assert = require('assert')
const path = require('path')

const root = path.join(__dirname, '..', '..')
const registerConfig = require(path.join(root, 'dist', 'twitch', 'twitch-api-config.js'))
const TwitchEventsubService = require(path.join(
  root,
  'dist',
  'twitch',
  'eventsub',
  'twitch-eventsub-service.js'
)).TwitchEventsubService

// Registering the node also declares its admin routes, which this test does not
// exercise but the module requires before it returns anything.
const routes = { get: () => {}, post: () => {} }

const {
  TwitchApiConfig,
  STATUS,
  connectedStatus,
  reconnectingStatus,
  classifyRefreshFailure,
  retryDelay,
  MAX_RETRY_ATTEMPTS,
} = registerConfig({ httpAdmin: routes, nodes: { registerType: () => {} } })

// --- Vocabulary ---

// Node-RED draws a ring for "not connected" and a dot for "connected", so green
// must never appear as a ring: that is how "looks fine but isn't" happens.
for (const [name, status] of Object.entries(STATUS)) {
  assert.ok(status.fill && status.shape && status.text, `${name} is incomplete`)
  if (status.fill === 'green') {
    assert.strictEqual(status.shape, 'dot', `${name} is green with a ${status.shape}`)
  }
}
assert.strictEqual(connectedStatus('someone').fill, 'green')
assert.strictEqual(connectedStatus('someone').shape, 'dot')
assert.match(connectedStatus('someone').text, /someone/)
assert.strictEqual(reconnectingStatus(3).fill, 'yellow')
assert.strictEqual(reconnectingStatus(3).shape, 'ring')
assert.match(reconnectingStatus(3).text, /3/)
// No countdown: a ticking status publishes a comms message a second at a time.
assert.ok(!/\d+s/.test(reconnectingStatus(1).text), 'reconnecting status ticks')
// A colon in status text is read by i18next as a namespace separator.
for (const status of [...Object.values(STATUS), connectedStatus('a'), reconnectingStatus(1)]) {
  assert.ok(!status.text.includes(':'), `status text has a colon: ${status.text}`)
}

// --- Failure classification ---

// A revoked refresh token: only a new login helps, so retrying wastes requests.
assert.strictEqual(classifyRefreshFailure({ statusCode: 400, body: '{"message":"invalid refresh token"}' }), 'revoked')
assert.strictEqual(classifyRefreshFailure({ statusCode: 401, body: '{"message":"Invalid OAuth token"}' }), 'revoked')
assert.strictEqual(classifyRefreshFailure({ statusCode: 400, body: '{"message":"invalid refresh token"}' }), 'revoked')
// A wrong client secret also answers 400, but the body is what tells them apart:
// "Re-authenticate needed" would be the wrong instruction for this one.
assert.strictEqual(classifyRefreshFailure({ statusCode: 400, body: '{"message":"invalid client"}' }), 'bad-secret')
assert.strictEqual(classifyRefreshFailure({ statusCode: 401, body: 'invalid client' }), 'bad-secret')
// Rate limited and unreachable are both worth another go.
assert.strictEqual(classifyRefreshFailure({ statusCode: 429 }), 'transient')
assert.strictEqual(classifyRefreshFailure({ statusCode: 500 }), 'transient')
assert.strictEqual(classifyRefreshFailure(new TypeError('fetch failed')), 'transient')
assert.strictEqual(classifyRefreshFailure(undefined), 'transient')
assert.strictEqual(classifyRefreshFailure({}), 'transient')

// --- Retry ladder ---

// The first retries are quick enough to ride out a blip, then it settles on a
// slow poll, and every delay is jittered so sibling config nodes spread out.
const first = retryDelay(1)
const second = retryDelay(2)
assert.ok(first <= 15000 * 1.2 && first >= 15000 * 0.9, `first delay ${first}`)
assert.ok(second > first, 'the ladder does not grow')
assert.ok(retryDelay(MAX_RETRY_ATTEMPTS) <= 300000 * 1.2)
assert.ok(retryDelay(1) >= 15000 * 0.9)
for (let attempt = 1; attempt <= 12; attempt += 1) {
  const delay = retryDelay(attempt)
  assert.ok(Number.isInteger(delay) && delay > 0, `delay for ${attempt} is ${delay}`)
}

/* ------------------------------------------------------------------ node -- */

// A stand-in for the Node-RED runtime members createNode copies onto the
// instance, capturing the statuses the node publishes so they can be asserted.
function fakeNode(config, credentials) {
  const statuses = []
  const warnings = []
  let ConfigCtor
  const RED = {
    httpAdmin: { get: () => {}, post: () => {} },
    nodes: {
      createNode(created) {
        created.status = (s) => statuses.push(s)
        created.log = () => {}
        created.warn = (m) => warnings.push(m)
        created.on = () => {}
      },
      getCredentials: () => credentials,
      registerType: (_type, ctor) => {
        ConfigCtor = ctor
      },
    },
  }
  require(path.join(__dirname, '..', '..', 'dist', 'twitch', 'twitch-api-config.js'))(RED)
  const node = new ConfigCtor(config)
  return { node, statuses, warnings, last: () => statuses[statuses.length - 1] }
}

const CONFIG = {
  id: 'cfg1',
  twitch_client_id: 'client-id',
  twitch_user_id: '12345',
  twitch_user_login: 'someone',
  twitch_mock_server_port: '',
}

;(async () => {
  // No token saved at all: the runtime says it is waiting, not that it is connected.
  {
    const { node, last } = fakeNode(CONFIG, {})
    await node.initAuth()
    assert.strictEqual(last().fill, 'yellow')
    assert.match(last().text, /Waiting for Twitch login/)
  }

  // The status is published on the node itself, which is what the config dialog
  // reads back out of the retained status/<id> message.
  {
    const { node, statuses, last } = fakeNode(CONFIG, {})
    await node.initAuth()
    assert.ok(statuses.length > 0, 'the config node published no status of its own')
    assert.strictEqual(last(), node.currentStatus)
  }

  // --- A retry that outlives the node ---
  //
  // The stray timer is the regression this guards: clearTimeout alone would not
  // help an initAuth() already in flight, so the generation counter is checked
  // after every await as well.
  const { node, statuses, last } = fakeNode(CONFIG, { twitch_refresh_token: 'rt' })

  // Force the transient path: a network failure has no status code.
  node.handleAuthFailure(new TypeError('fetch failed'))
  assert.strictEqual(last().fill, 'yellow', 'a blip must not go red')
  assert.match(last().text, /Reconnecting \(attempt 1\)/)

  await node.shutdown()
  assert.strictEqual(node.retryTimer, undefined, 'a retry timer survived close')
  assert.strictEqual(node.retryAttempt, 0)
  const before = statuses.length
  // A timer that survived close would fire inside this window. It is also what
  // kept an earlier version of this test hanging on a real Twitch call, so the
  // wait is bounded rather than open-ended.
  await new Promise((resolve) => setTimeout(resolve, 60))
  assert.strictEqual(statuses.length, before, 'a closed node kept publishing status')

  // --- Two failures, then close ---
  //
  // Each transient failure schedules its own timer but only the newest is held
  // in retryTimer, so clearTimeout on close can only clear one. Without an
  // explicit clear the older ones survive and revive a closed node.
  const { node: twice } = fakeNode(CONFIG, { twitch_refresh_token: 'rt' })
  const realSetTimeout = global.setTimeout
  const timers = []
  global.setTimeout = function (fn, ms, ...rest) {
    const handle = realSetTimeout(fn, ms, ...rest)
    timers.push(handle)
    return handle
  }
  try {
    twice.handleAuthFailure(new TypeError('fetch failed'))
    twice.handleAuthFailure(new TypeError('fetch failed'))
  } finally {
    global.setTimeout = realSetTimeout
  }
  assert.strictEqual(timers.length, 2, 'expected two pending retries')

  await twice.shutdown()
  // Node marks a cleared timeout destroyed, so this catches a surviving timer
  // without waiting out its real delay. The real delay would also leave the test
  // hanging on a live auth call rather than failing with a message.
  for (const handle of timers) {
    assert.strictEqual(handle._destroyed, true, 'a retry timer survived close')
  }

  // --- The ladder terminates ---
  const second = fakeNode(CONFIG, { twitch_refresh_token: 'rt' })
  for (let i = 0; i < MAX_RETRY_ATTEMPTS + 2; i += 1) {
    second.node.handleAuthFailure(new TypeError('fetch failed'))
  }
  assert.strictEqual(second.last().fill, 'red')
  assert.match(second.last().text, /Gave up/, `expected a terminal status, got ${second.last().text}`)
  assert.ok(
    second.warnings.some((w) => /Gave up/.test(w)),
    'giving up is logged'
  )
  await second.node.shutdown()

  // --- A revoked token stops immediately ---
  const revoked = fakeNode(CONFIG, { twitch_refresh_token: 'rt' })
  revoked.node.handleAuthFailure({ statusCode: 400, body: '{"message":"invalid refresh token"}' })
  assert.strictEqual(revoked.last().fill, 'red')
  assert.match(revoked.last().text, /Re-authenticate needed/)
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.ok(
    !/Reconnecting/.test(revoked.last().text),
    'a revoked token must not go back on the retry ladder'
  )
  await revoked.node.shutdown()

  // --- A wrong client secret gets its own instruction ---
  const badSecret = fakeNode(CONFIG, { twitch_refresh_token: 'rt' })
  badSecret.node.handleAuthFailure({ statusCode: 400, body: '{"message":"invalid client"}' })
  assert.strictEqual(badSecret.last().fill, 'red')
  assert.match(badSecret.last().text, /Check client secret/)
  await badSecret.node.shutdown()

  // --- An in-flight initAuth must not revive a closed node ---
  //
  // Driven through the real Twurple provider rather than a stub: the guard sits
  // after a network call, so only a real addUserForToken can prove it.
  const crossFetch = require(path.join(root, 'node_modules', '@d-fischer', 'cross-fetch'))
  const realFetch = crossFetch.default

  // A refresh the user cancelled: Twitch answers 400 invalid refresh token.
  const revokedResponse = () =>
    new Response(JSON.stringify({ status: 400, message: 'invalid refresh token' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })

  // --- A revoked token at startup goes red immediately, with no retries ---
  //
  // Without classification this loops the whole ladder (and its timers) before
  // anything red appears, which is the behaviour the plan called out.
  const startup = fakeNode(CONFIG, { twitch_refresh_token: 'bad-refresh-token' })
  crossFetch.default = async () => revokedResponse()
  try {
    await assert.rejects(() => startup.node.initAuth(), 'a rejected token must reject')
  } finally {
    crossFetch.default = realFetch
  }
  assert.strictEqual(startup.last().fill, 'red', 'a revoked token must be red')
  assert.match(startup.last().text, /Re-authenticate needed/)
  assert.strictEqual(startup.node.retryAttempt, 0, 'a revoked token went on the retry ladder')
  assert.strictEqual(startup.node.retryTimer, undefined)
  assert.strictEqual(startup.node.authProvider, undefined, 'a dead provider was kept')
  assert.strictEqual(startup.node.authReady, false)
  assert.ok(
    startup.warnings.some((w) => /refresh token/.test(w)),
    'a rejected token is not logged'
  )
  await startup.node.shutdown()

  // --- An unreachable Twitch is retried, not failed ---
  const unreachable = fakeNode(CONFIG, { twitch_refresh_token: 'rt' })
  crossFetch.default = async () => {
    throw new TypeError('fetch failed')
  }
  try {
    await assert.rejects(() => unreachable.node.initAuth())
  } finally {
    crossFetch.default = realFetch
  }
  assert.strictEqual(unreachable.last().fill, 'yellow', 'a network blip must not go red')
  assert.match(unreachable.last().text, /Reconnecting \(attempt 1\)/)
  assert.strictEqual(unreachable.node.retryAttempt, 1)
  assert.strictEqual(unreachable.node.authProvider, undefined, 'a dead provider was kept')
  assert.strictEqual(unreachable.node.authReady, false)
  await unreachable.node.shutdown()

  // --- An in-flight initAuth must not revive a closed node ---
  //
  // The network call is held open, the node closes underneath it, and the call
  // then succeeds: without the generation guard the node would adopt the
  // provider and report green after its deploy.
  const inflight = fakeNode(CONFIG, { twitch_refresh_token: 'rt' })
  let releaseFetches
  const held = new Promise((resolve) => {
    releaseFetches = resolve
  })
  crossFetch.default = async (url) => {
    // Every call waits for the same release, so a second Twitch request cannot
    // strand the test on a promise nothing resolves.
    await held
    // A token refresh is followed by a validate call, and Twurple rejects a
    // response without a user id, so the stub has to answer both properly or the
    // node fails for a reason that has nothing to do with the guard.
    const body = String(url).includes('/validate')
      ? { client_id: 'client-id', login: 'someone', scopes: [], user_id: '12345', expires_in: 3600 }
      : { access_token: 'a', refresh_token: 'r', expires_in: 3600, scope: [] }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const pending = inflight.node.initAuth()
  // Let initAuth get as far as awaiting Twitch before closing.
  await new Promise((resolve) => setImmediate(resolve))
  await inflight.node.shutdown()
  releaseFetches()
  await pending.catch(() => {})
  crossFetch.default = realFetch

  assert.strictEqual(inflight.node.authReady, false, 'a closed node adopted the provider')
  assert.strictEqual(inflight.node.authProvider, undefined, 'a closed node kept a provider')
  assert.notStrictEqual(inflight.last().fill, 'green', 'a closed node reported connected')

  // --- A failure that lands after close must stay silent ---
  //
  // Same shape, opposite outcome: the node closes while the request is in flight
  // and the request then fails. Reporting it would schedule a retry on a dead
  // node, which is what the guard in the catch is for.
  const lateFailure = fakeNode(CONFIG, { twitch_refresh_token: 'rt' })
  let failFetch
  const heldFail = new Promise((resolve) => {
    failFetch = resolve
  })
  // A revoked token, because that branch publishes a terminal status outright.
  // The transient branch is safe on its own: scheduleRetry returns early when
  // closed, so a blip cannot revive a dead node either way.
  crossFetch.default = async () => {
    await heldFail
    return revokedResponse()
  }
  const failing = lateFailure.node.initAuth()
  await new Promise((resolve) => setImmediate(resolve))
  await lateFailure.node.shutdown()
  const afterClose = lateFailure.statuses.length
  failFetch()
  await failing.catch(() => {})
  crossFetch.default = realFetch

  assert.strictEqual(
    lateFailure.statuses.length,
    afterClose,
    'a closed node reported a failure that arrived after it closed'
  )
  assert.strictEqual(lateFailure.node.retryTimer, undefined, 'a closed node scheduled a retry')

  // --- A successful retry reaches Connected ---
  //
  // The whole point of the ladder: after a blip the node ends up connected again
  // without a deploy. initAuth alone is not enough, so this also proves the retry
  // restarts EventSub and lands on the green dot rather than stopping at auth.
  const recovered = fakeNode(CONFIG, { twitch_refresh_token: 'rt' })
  crossFetch.default = async (url) => {
    const body = String(url).includes('/validate')
      ? { client_id: 'client-id', login: 'someone', scopes: [], user_id: '12345', expires_in: 3600 }
      : { access_token: 'a', refresh_token: 'r', expires_in: 3600, scope: [] }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  // The first attempt cannot reach Twitch, the second one can.
  let attempts = 0
  const flakyFetch = crossFetch.default
  crossFetch.default = async (url, opts) => {
    attempts += 1
    if (attempts === 1) throw new TypeError('fetch failed')
    return flakyFetch(url, opts)
  }
  // initEventsub opens a websocket, which this test has no use for; stub the
  // service start so the ladder's success path is what is under test.
  // Each fakeNode() call re-registers the type, so the ctor under test is a
  // fresh class: patch that instance's prototype, not the module's first one.
  const recoveredProto = Object.getPrototypeOf(recovered.node)
  const eventsubStart = recoveredProto.initEventsub
  recoveredProto.initEventsub = async function () {
    this.eventsubService = { addSubscription() {}, removeSubscription() {}, stop: async () => {} }
    this.updateStatus(connectedStatus('someone'))
  }
  try {
    await assert.rejects(() => recovered.node.initAuth())
    assert.strictEqual(recovered.last().fill, 'yellow')

    // Run the scheduled retry without waiting out its real 15s delay.
    clearTimeout(recovered.node.retryTimer)
    recovered.node.retryTimer = undefined
    await recovered.node.retryAuth()
  } finally {
    recoveredProto.initEventsub = eventsubStart
    crossFetch.default = realFetch
  }

  assert.strictEqual(recovered.last().fill, 'green', 'a recovered node did not go green')
  assert.strictEqual(recovered.last().shape, 'dot')
  assert.strictEqual(recovered.node.retryAttempt, 0, 'the attempt counter was not reset')

  // --- A failure from the provider that was already replaced ---
  //
  // The ladder builds a fresh provider on every attempt, but the ApiClients and
  // EventSub listeners built from the old one are not always gone with it, and
  // Twurple keeps the failure cached on that instance. A late emit from the old
  // provider must not wipe the healthy one or queue another retry — the node is
  // connected and says so.
  {
    const raced = fakeNode(CONFIG, { twitch_refresh_token: 'rt', twitch_client_secret: 's' })
    crossFetch.default = async (url) => {
      const body = String(url).includes('/validate')
        ? { client_id: 'client-id', login: 'someone', scopes: [], user_id: '12345', expires_in: 3600 }
        : { access_token: 'a', refresh_token: 'r', expires_in: 3600, scope: [] }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const racedProto = Object.getPrototypeOf(raced.node)
    const eventsubStart = racedProto.initEventsub
    racedProto.initEventsub = async function () {
      this.eventsubService = { addSubscription() {}, removeSubscription() {}, stop: async () => {} }
      this.updateStatus(connectedStatus('someone'))
    }
    try {
      await raced.node.initAuth()
      const oldProvider = raced.node.authProvider

      // The blip the ladder recovers from.
      oldProvider.emit(oldProvider.onRefreshFailure, '12345', new TypeError('fetch failed'))
      clearTimeout(raced.node.retryTimer)
      raced.node.retryTimer = undefined
      await raced.node.retryAuth()

      const healthy = raced.node.authProvider
      assert.strictEqual(raced.last().fill, 'green', 'the node did not recover')
      assert.notStrictEqual(healthy, oldProvider, 'the ladder reused the failed provider')

      // Now the old provider fails again, after it was replaced.
      oldProvider.emit(oldProvider.onRefreshFailure, '12345', {
        statusCode: 400,
        body: '{"message":"invalid refresh token"}',
        message: 'invalid refresh token',
      })

      assert.strictEqual(raced.node.authProvider, healthy, 'a stale failure dropped the current provider')
      assert.strictEqual(raced.node.authReady, true, 'a stale failure marked the node unready')
      assert.strictEqual(raced.last().fill, 'green', 'a stale failure replaced a healthy status')
      assert.strictEqual(raced.node.retryTimer, undefined, 'a stale failure scheduled a retry')
    } finally {
      racedProto.initEventsub = eventsubStart
      crossFetch.default = realFetch
      await raced.node.shutdown()
    }
  }

  await recovered.node.shutdown()

  // --- shutdown() publishes nothing, removeNode() says idle ---
  //
  // takedown() is reached both by removeNode() — where the config node stays
  // deployed and usable, so a status is honest — and by shutdown(), where the
  // node is gone and the rule is that nothing publishes after close.
  {
    const gone = fakeNode(CONFIG, {})
    await gone.node.initAuth()
    const beforeClose = gone.statuses.length
    await gone.node.shutdown()
    assert.strictEqual(
      gone.statuses.length,
      beforeClose,
      'a node on its way out still published a status'
    )
  }
  {
    const idle = fakeNode(CONFIG, { twitch_refresh_token: 'rt' })
    const stopped = []
    const realStart = TwitchEventsubService.prototype.start
    const realStop = TwitchEventsubService.prototype.stop
    TwitchEventsubService.prototype.start = async function () {
      this.started = true
    }
    TwitchEventsubService.prototype.stop = async function () {
      stopped.push(1)
      return realStop.call(this)
    }
    crossFetch.default = async (url) => {
      const body = String(url).includes('/validate')
        ? { client_id: 'client-id', login: 'someone', scopes: [], user_id: '12345', expires_in: 3600 }
        : { access_token: 'a', refresh_token: 'r', expires_in: 3600, scope: [] }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    try {
      idle.node.addNode('u1', { status: () => {}, triggerTwitchEvent: () => {} }, 'twitch-eventsub-channel-follow')
      for (let i = 0; i < 50 && !idle.node.eventsubService; i += 1) {
        await new Promise((r) => setTimeout(r, 20))
      }
      assert.ok(idle.node.eventsubService, 'no service to tear down')
      await new Promise((resolve) => idle.node.removeNode('u1', 'twitch-eventsub-channel-follow', resolve))
      assert.strictEqual(idle.last().fill, 'grey', 'an idle config node is not grey')
      assert.strictEqual(idle.last().shape, 'ring')
      assert.match(idle.last().text, /Not connected/)
    } finally {
      TwitchEventsubService.prototype.start = realStart
      TwitchEventsubService.prototype.stop = realStop
      crossFetch.default = realFetch
      await idle.node.shutdown()
    }
  }

  // --- A terminal failure takes the EventSub service with it ---
  //
  // The listener holds the ApiClient that just failed. Left running it keeps
  // refreshing against a known-bad provider, and every attempt emits a failure at
  // a node that has already published "Re-authenticate needed".
  {
    const revoked = fakeNode(CONFIG, { twitch_refresh_token: 'rt', twitch_client_secret: 's' })
    crossFetch.default = async (url) => {
      const body = String(url).includes('/validate')
        ? { client_id: 'client-id', login: 'someone', scopes: [], user_id: '12345', expires_in: 3600 }
        : { access_token: 'a', refresh_token: 'r', expires_in: 3600, scope: [] }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const realStart = TwitchEventsubService.prototype.start
    const realStop = TwitchEventsubService.prototype.stop
    let stopped = 0
    TwitchEventsubService.prototype.start = async function () {
      this.started = true
    }
    TwitchEventsubService.prototype.stop = async function () {
      stopped += 1
      return realStop.call(this)
    }
    try {
      revoked.node.addNode('u1', { status: () => {}, triggerTwitchEvent: () => {} }, 'twitch-eventsub-channel-follow')
      for (let i = 0; i < 50 && !revoked.node.eventsubService; i += 1) {
        await new Promise((r) => setTimeout(r, 20))
      }
      assert.ok(revoked.node.eventsubService, 'no service to tear down')
      stopped = 0

      const provider = revoked.node.authProvider
      provider.emit(provider.onRefreshFailure, '12345', {
        statusCode: 400,
        body: '{"message":"invalid refresh token"}',
        message: 'invalid refresh token',
      })

      assert.strictEqual(revoked.node.eventsubService, undefined, 'the service survived a terminal failure')
      assert.ok(stopped > 0, 'the service was dropped without stopping it')
      assert.strictEqual(revoked.last().text, STATUS.reauthNeeded.text)
    } finally {
      TwitchEventsubService.prototype.start = realStart
      TwitchEventsubService.prototype.stop = realStop
      crossFetch.default = realFetch
      await revoked.node.shutdown()
    }
  }

  // --- A terminal auth failure survives the addNode() chain ---
  //
  // addNode() catches whatever initAuth() throws, and a revoked token is the case
  // where the two disagree: auth has already said "Re-authenticate needed" and
  // reset the counter, so a catch that guesses from that counter replaces the
  // instruction with a raw EventSub error the user cannot act on.
  {
    const cfg = fakeNode(CONFIG, { twitch_refresh_token: 'rt', twitch_client_secret: 's' })
    crossFetch.default = async () =>
      new Response(JSON.stringify({ message: 'invalid refresh token' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    try {
      cfg.node.addNode('ev1', { status: () => {}, triggerTwitchEvent: () => {} }, 'channel.follow')
      await new Promise((r) => setTimeout(r, 250))
      assert.strictEqual(
        cfg.last().text,
        STATUS.reauthNeeded.text,
        'addNode() overwrote the terminal auth status'
      )
      assert.strictEqual(cfg.last().fill, 'red')
      assert.strictEqual(cfg.node.retryTimer, undefined, 'a revoked token was retried')
    } finally {
      crossFetch.default = realFetch
      await cfg.node.shutdown()
    }
  }

  // --- An EventSub failure is reported even though auth succeeded ---
  //
  // retryAuth() runs auth and EventSub in one step, so a start() that throws has
  // no _doAuth behind it: without its own status the node would sit on
  // "Subscribing to events…" forever while nothing retries.
  {
    const svc = fakeNode(CONFIG, { twitch_refresh_token: 'rt', twitch_client_secret: 's' })
    crossFetch.default = async (url) => {
      const body = String(url).includes('/validate')
        ? { client_id: 'client-id', login: 'someone', scopes: [], user_id: '12345', expires_in: 3600 }
        : { access_token: 'a', refresh_token: 'r', expires_in: 3600, scope: [] }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const proto = Object.getPrototypeOf(svc.node)
    const real = proto.initEventsub
    proto.initEventsub = async function () {
      this.updateStatus(STATUS.subscribing)
      throw new Error('EventSub listener refused the connection')
    }
    try {
      await svc.node.initAuth()
      svc.node.retryAttempt = 2
      await svc.node.retryAuth()
      assert.strictEqual(svc.last().fill, 'red', 'an EventSub failure left a non-red status')
      assert.match(svc.last().text, /EventSub listener/)
      assert.ok(
        svc.warnings.some((w) => /EventSub setup failed/.test(w)),
        'an EventSub failure was not logged'
      )
    } finally {
      proto.initEventsub = real
      crossFetch.default = realFetch
      await svc.node.shutdown()
    }
  }

  // --- A start() that throws must not leave a service nothing can retry ---
  //
  // initEventsub() returns early when a service is already set, so a half-built
  // one left behind by a failed start() would make every later attempt a silent
  // no-op and the nodes stay connected but unsubscribed.
  {
    const svc = fakeNode(CONFIG, { twitch_refresh_token: 'rt', twitch_client_secret: 's' })
    crossFetch.default = async (url) => {
      const body = String(url).includes('/validate')
        ? { client_id: 'client-id', login: 'someone', scopes: [], user_id: '12345', expires_in: 3600 }
        : { access_token: 'a', refresh_token: 'r', expires_in: 3600, scope: [] }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const realStart = TwitchEventsubService.prototype.start
    // stop() has to run before the half-built service is dropped, or the listener
    // it half-wired keeps its socket.
    const realStop = TwitchEventsubService.prototype.stop
    let stopped = 0
    TwitchEventsubService.prototype.stop = async function () {
      stopped += 1
      return realStop.call(this)
    }
    let builds = 0
    TwitchEventsubService.prototype.start = async function () {
      builds += 1
      throw new Error('EventSub listener refused the connection')
    }
    try {
      await svc.node.initAuth()
      await assert.rejects(() => svc.node.initEventsub(), 'start() must reject')
      assert.strictEqual(svc.node.eventsubService, undefined, 'a half-built service was kept')
      assert.ok(stopped > 0, 'the half-built service was dropped without stopping it')
      await assert.rejects(() => svc.node.initEventsub(), 'the retry must reject too')
      assert.strictEqual(builds, 2, 'the retry did not rebuild the service')
    } finally {
      TwitchEventsubService.prototype.start = realStart
      TwitchEventsubService.prototype.stop = realStop
      crossFetch.default = realFetch
      await svc.node.shutdown()
    }
  }

  // --- A running node recovers from a blip without lying about it ---
  //
  // The gap this covers: the node is already connected when the refresh fails, so
  // onRefreshFailure leaves a live EventSub service behind. Its listener still
  // points at the provider that just failed — and Twurple keeps that failure in
  // _cachedRefreshFailures until addUserForToken runs on that same instance — so
  // reusing the service leaves the node green with a socket that cannot resubscribe.
  {
    const live = fakeNode(CONFIG, { twitch_refresh_token: 'rt', twitch_client_secret: 's' })
    crossFetch.default = async (url) => {
      const body = String(url).includes('/validate')
        ? { client_id: 'client-id', login: 'someone', scopes: [], user_id: '12345', expires_in: 3600 }
        : { access_token: 'a', refresh_token: 'r', expires_in: 3600, scope: [] }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    // start() opens the websocket; the point of this test is what happens after a
    // failed refresh, not the socket, so it stays inert.
    const realStart = TwitchEventsubService.prototype.start
    TwitchEventsubService.prototype.start = async function () {
      this.started = true
    }
    const EVENT = 'twitch-eventsub-channel-follow'
    try {
      const listeners = []
      live.node.addNode('ev1', { status: (s) => listeners.push(s), triggerTwitchEvent: () => {} }, EVENT)
      for (let i = 0; i < 50 && !live.node.eventsubService; i += 1) {
        await new Promise((r) => setTimeout(r, 20))
      }
      const before = live.node.eventsubService
      assert.ok(before, 'the node never got an EventSub service')
      assert.strictEqual(before.subscriptionCounts.get(EVENT), 1, 'the subscription was not registered')

      // What Twitch does when a refresh fails mid-life: the provider poisons that
      // user and emits here. This is the runtime path, not a startup failure.
      const poisoned = live.node.authProvider
      poisoned.emit(poisoned.onRefreshFailure, '12345', new TypeError('fetch failed'))
      assert.strictEqual(live.last().fill, 'yellow', 'a blip did not go back to reconnecting')
      assert.strictEqual(live.node.authProvider, undefined, 'the failed provider was kept')

      clearTimeout(live.node.retryTimer)
      live.node.retryTimer = undefined
      await live.node.retryAuth()

      const after = live.node.eventsubService
      assert.ok(after, 'the retry left no EventSub service')
      assert.notStrictEqual(after, before, 'the retry reused the service bound to the failed provider')
      assert.strictEqual(after.subscriptionCounts.get(EVENT), 1, 'the rebuild lost the subscription')
      assert.strictEqual(live.last().fill, 'green', 'a recovered node did not go green')
      assert.strictEqual(
        after.listener._apiClient,
        live.node.apiClient,
        'the rebuilt service is not on the ApiClient initAuth just created'
      )
    } finally {
      TwitchEventsubService.prototype.start = realStart
      crossFetch.default = realFetch
      await live.node.shutdown()
    }
  }

  // --- A refresh that fails while the node is closing reports nothing ---
  //
  // onRefreshFailure is not awaited by anything, so it can land after shutdown().
  // The status would then be published by a node that is already gone.
  {
    const closing = fakeNode(CONFIG, { twitch_refresh_token: 'rt', twitch_client_secret: 's' })
    crossFetch.default = async (url) => {
      const body = String(url).includes('/validate')
        ? { client_id: 'client-id', login: 'someone', scopes: [], user_id: '12345', expires_in: 3600 }
        : { access_token: 'a', refresh_token: 'r', expires_in: 3600, scope: [] }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const realStart = TwitchEventsubService.prototype.start
    TwitchEventsubService.prototype.start = async function () {
      this.started = true
    }
    try {
      await closing.node.initAuth()
      const provider = closing.node.authProvider
      await closing.node.shutdown()
      const published = closing.statuses.length
      // A terminal one: the transient path already returns on closed, and it is the
      // terminal branches that publish a red status.
      provider.emit(provider.onRefreshFailure, '12345', {
        statusCode: 400,
        body: '{"message":"invalid refresh token"}',
        message: 'invalid refresh token',
      })
      assert.strictEqual(
        closing.statuses.length,
        published,
        'a closed node published a refresh failure'
      )
      assert.strictEqual(closing.node.retryTimer, undefined, 'a closed node scheduled a retry')
    } finally {
      TwitchEventsubService.prototype.start = realStart
      crossFetch.default = realFetch
    }
  }

  // --- An EventSub setup failure is red, and does not rewind the ladder ---
  //
  // Deliberate asymmetry: auth failures get the backoff ladder, EventSub setup
  // failures do not, because their usual causes (bad secret, no subscriptions for
  // this app) need the user rather than time. The one thing it must not do is
  // rewind retryAttempt, which is auth's counter — a later auth failure would then
  // jump back to the first, impatient delay instead of continuing where it was.
  {
    const broken = fakeNode(CONFIG, {})
    await broken.node.initAuth()
    const brokenProto = Object.getPrototypeOf(broken.node)
    const eventsubStart = brokenProto.initEventsub
    brokenProto.initEventsub = async function () {
      throw new Error('WebSocket error: connection refused');
    }
    try {
      broken.node.retryAttempt = 3
      await broken.node.retryAuth()
      assert.strictEqual(broken.last().fill, 'red', 'an EventSub setup failure is not red')
      assert.match(broken.last().text, /connection refused/, 'the reason was dropped')
      assert.strictEqual(broken.node.retryAttempt, 3, 'the auth ladder was rewound')
      assert.strictEqual(broken.node.retryTimer, undefined, 'an EventSub failure queued a retry')
    } finally {
      brokenProto.initEventsub = eventsubStart
      await broken.node.shutdown()
    }
  }

  console.log('config status test: ok')
})().catch((err) => {
  console.error('config status test failed:', err.message)
  process.exit(1)
})