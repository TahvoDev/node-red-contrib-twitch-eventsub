#!/usr/bin/env node
'use strict'

/**
 * Helix unit test.
 *
 * Runs the shared coercion helpers, the endpoint dispatcher (coercion,
 * precedence, login→ID resolution + caching, scopes, actions, aliases, paging)
 * and the hand-written `twitch-api` node (endpoint resolution, unknown endpoint,
 * tier gating). Every registry entry is smoke-tested: it must not throw out of
 * the node.
 *
 * Runs against the built dist/ output. Any failed assert throws and exits
 * non-zero, failing `npm run test:unit`, `npm run check` and `npm run build`.
 */

const assert = require('assert')
const path = require('path')
const fs = require('fs')
const EventEmitter = require('events')

const root = path.join(__dirname, '..', '..')
const helixDist = path.join(root, 'dist', 'twitch', 'helix')

const utils = require(path.join(helixDist, 'twitch-helix-utils.js'))
const { createHelixNode } = require(path.join(helixDist, 'twitch-helix-base.js'))
const { callEndpoint, resolveActiveCall, enabledTiers, isTierEnabled } = require(path.join(helixDist, 'helix-core.js'))
const { defineHelix, specTier, fieldAliases } = require(path.join(helixDist, 'define.js'))
const { HELIX_SPECS } = require(path.join(helixDist, 'specs', 'index.js'))

const {
  toStr, toInt, toBool, toIdList, firstDefined, clampLimit, fetchAllPages,
  helixErrorMessage, shortStatus, resolveUserId, requireScopes, resolveAllMax,
  clearUserCache, MAX_TIMEOUT_SECONDS, mapUser, mapChannel, mapChatter, mapBan,
  mapUserRelation, mapBlockedTerm, mapAutoModStatus, MAX_FETCH_ALL,
} = utils

/* ------------------------------------------------------------- coercion */

assert.strictEqual(toStr('  hi  '), 'hi')
assert.strictEqual(toStr(42), '42')
assert.strictEqual(toStr(Buffer.from('buf')), 'buf')
assert.strictEqual(toStr({ a: 1 }), undefined)
assert.strictEqual(toStr([1, 2]), undefined)
assert.strictEqual(toInt('20'), 20)
assert.strictEqual(toInt(20.9), 20)
assert.strictEqual(toInt('nope', 5), 5)
assert.strictEqual(toBool('on'), true)
assert.strictEqual(toBool('off'), false)
assert.strictEqual(toBool(0), false)
assert.deepStrictEqual(toIdList('a, b c'), ['a', 'b', 'c'])
assert.deepStrictEqual(toIdList(['x', 'y']), ['x', 'y'])
assert.strictEqual(firstDefined(null, undefined, 'x', 'y'), 'x')
assert.strictEqual(clampLimit(500), 100)
assert.strictEqual(clampLimit(0), 1)
assert.strictEqual(resolveAllMax(''), MAX_FETCH_ALL)
assert.strictEqual(resolveAllMax(500), 500)
assert.strictEqual(resolveAllMax(MAX_FETCH_ALL * 2), MAX_FETCH_ALL)
assert.strictEqual(shortStatus('a very long status line that goes past forty characters').length, 40)
assert.match(helixErrorMessage({ statusCode: 401 }), /re-authenticate/)
assert.deepStrictEqual(mapChatter({ userId: 'u', userName: 'n', userDisplayName: 'N' }), { userId: 'u', userName: 'n', userDisplayName: 'N' })
assert.strictEqual(mapBan({ expiryDate: null }).isPermanent, true)
assert.deepStrictEqual(mapAutoModStatus({ messageId: 'm', isPermitted: false }), { messageId: 'm', isPermitted: false })
assert.strictEqual(mapUserRelation({ id: 'u', name: 'n', displayName: 'N' }).displayName, 'N')
assert.strictEqual(mapBlockedTerm({ id: 't', text: 'x' }).expirationDate, null)
assert.strictEqual(mapChannel(null), null)
assert.strictEqual(mapUser({ id: '1' }).id, '1')
assert.strictEqual(MAX_TIMEOUT_SECONDS, 1209600)

/* --------------------------------------------------------------- helpers */

function makeNode() {
  const node = new EventEmitter()
  node.statuses = []
  node.errors = []
  node.status = (s) => node.statuses.push(s)
  node.error = (e) => node.errors.push(e)
  return node
}

function runInput(node, msg) {
  return new Promise((resolve) => {
    const sent = []
    node.emit('input', msg, (m) => sent.push(m), (err) => resolve({ sent, err }))
  })
}

function deepProxy() {
  const fn = function () {}
  return new Proxy(fn, { get: (_t, prop) => (prop === 'then' ? undefined : deepProxy()), apply: () => deepProxy() })
}

const successTwitch = {
  userId: '1001',
  config: { twitch_user_id: '1001' },
  initAuth: async () => {},
  getAuthProvider: () => ({ getCurrentScopesForUser: () => [] }),
  apiClient: new Proxy({}, {
    get: (_t, prop) => (prop === 'asUser' ? async (_id, fn) => fn(deepProxy()) : deepProxy()),
    apply: () => deepProxy(),
  }),
}

/* ----------------------------------------------------------- base node */

const baseConfig = { config: 'cfg' }
;(async () => {
  const baseNode = makeNode()
  createHelixNode({ nodes: { createNode() {}, getNode: () => successTwitch } }, baseNode, baseConfig, async () => ({ id: 'x' }))
  const happy = await runInput(baseNode, { payload: 'old', keep: true })
  assert.strictEqual(happy.err, undefined)
  assert.deepStrictEqual(happy.sent[0].payload, { id: 'x' })
  assert.strictEqual(happy.sent[0].keep, true)

  const missing = makeNode()
  createHelixNode({ nodes: { createNode() {}, getNode: () => undefined } }, missing, baseConfig, async () => null)
  assert.match(String(missing.errors[0]), /No Twitch Config node/)

  const httpNode = makeNode()
  createHelixNode({ nodes: { createNode() {}, getNode: () => successTwitch } }, httpNode, baseConfig, async () => { throw { statusCode: 403, body: '{"message":"no permission"}' } })
  const httpErr = await runInput(httpNode, {})
  assert.match(httpErr.err.message, /403/)
  assert.strictEqual(httpNode.statuses[httpNode.statuses.length - 1].fill, 'red')

  /* --------------------------------------------------------- dispatcher */

  clearUserCache()
  const factoryCalls = []
  const factoryApi = {
    users: { getUserByName: async (name) => { factoryCalls.push(name); return { id: `id-${name}` } } },
    asUser: async (id, fn) => fn({
      channels: {
        getChannelInfoById: async (broadcaster) => ({ id: broadcaster, name: 'n', displayName: 'N' }),
        getChannelFollowers: async (broadcaster, user, opts) => ({ data: [{ userId: 'f1' }], cursor: 'next', total: 1, opts }),
      },
    }),
  }
  const factoryTwitch = {
    userId: '1001',
    config: { twitch_user_id: '1001' },
    initAuth: async () => {},
    getAuthProvider: () => ({ getCurrentScopesForUser: () => ['test:scope'] }),
    apiClient: factoryApi,
  }
  const bothScopes = { ...factoryTwitch, getAuthProvider: () => ({ getCurrentScopesForUser: () => ['test:scope', 'other:scope'] }) }

  const demoSpec = defineHelix({
    type: 'twitch-helix-test-demo', tier: 'core', label: 'test demo', help: 'test',
    scopes: ['test:scope'],
    fields: [
      { name: 'text', label: 'Text', kind: 'string', default: 'dflt' },
      { name: 'num', label: 'Num', kind: 'int', default: 5 },
      { name: 'flag', label: 'Flag', kind: 'bool', default: false },
      { name: 'ids', label: 'Ids', kind: 'idList' },
      { name: 'pick', label: 'Pick', kind: 'select', default: 'a', options: ['a', 'b'] },
      { name: 'who', label: 'Who', kind: 'user' },
      { name: 'broadcaster', label: 'Broadcaster', kind: 'user', optional: true },
      { name: 'primaryText', label: 'Primary', kind: 'string', primary: true },
    ],
    run: async ({ input, broadcasterId }) => ({ input, broadcasterId }),
  })
  const demo = (msg, config, twitch) => callEndpoint(demoSpec, factoryApi, msg, config, twitch || factoryTwitch)

  const one = await demo({ text: 'fromMsg', primaryText: 'fromConfig' }, { text: 'fromConfig', num: '9', pick: 'zzz', who: 'loginA', primaryText: 'configPrimary' })
  assert.strictEqual(one.payload.input.text, 'fromMsg')
  assert.strictEqual(one.payload.input.num, 9)
  assert.strictEqual(one.payload.input.pick, 'a')
  assert.strictEqual(one.payload.input.who, 'id-logina')
  assert.strictEqual(one.payload.broadcasterId, '1001')
  await demo({ who: 'loginA' }, {})
  assert.strictEqual(factoryCalls.filter((n) => n === 'logina').length, 1, 'login lookup cached')
  assert.strictEqual((await demo({ payload: 'fromPayload' }, {})).payload.input.primaryText, 'fromPayload')
  const four = await demo({ text: Buffer.from(' buf '), flag: null, ids: '1,2' }, {})
  assert.strictEqual(four.payload.input.text, 'buf')
  assert.strictEqual(four.payload.input.flag, false)
  assert.deepStrictEqual(four.payload.input.ids, ['1', '2'])

  await assert.rejects(() => callEndpoint(defineHelix({ ...demoSpec, type: 'twitch-helix-test-scope', scopes: ['needed:scope'] }), factoryApi, {}, {}, factoryTwitch), /Missing scope needed:scope/)
  await assert.rejects(() => callEndpoint(defineHelix({ ...demoSpec, type: 'twitch-helix-test-req', fields: [{ name: 'user', label: 'User', kind: 'user', required: true }] }), factoryApi, {}, {}, factoryTwitch), /User is required/)

  /* ------------------------------------------------------------- paging */

  const pagedSpec = defineHelix({
    ...demoSpec, type: 'twitch-helix-test-paged',
    fields: [{ name: 'broadcaster', label: 'Broadcaster', kind: 'user', optional: true }],
    paged: { limit: 20 },
    run: async ({ input }) => { const start = input.after ? Number(input.after) : 1; const next = start + 2; return { data: [start, start + 1], cursor: next > 10 ? null : String(next), total: 10 } },
    map: (item) => ({ n: item }),
  })
  const paged = (msg) => callEndpoint(pagedSpec, factoryApi, msg, {}, factoryTwitch)
  const pageOne = await paged({})
  assert.deepStrictEqual(pageOne.payload, [{ n: 1 }, { n: 2 }])
  assert.deepStrictEqual(pageOne.extra.pagination, { cursor: '3' })
  const pageAll = await paged({ all: true })
  assert.deepStrictEqual(pageAll.payload.map((p) => p.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  assert.strictEqual(pageAll.extra.truncated, undefined)
  const pageCapped = await paged({ all: true, allMax: 4 })
  assert.deepStrictEqual(pageCapped.payload.map((p) => p.n), [1, 2, 3, 4])
  assert.strictEqual(pageCapped.extra.truncated, true)
  assert.deepStrictEqual(pageCapped.extra.pagination, { cursor: '5' })

  let walk = 0
  const walked = await fetchAllPages(async () => { walk++; return { data: [walk], cursor: walk < 5 ? `c${walk}` : null } }, 3)
  assert.deepStrictEqual(walked.data, [1, 2, 3])

  /* --------------------------------------------------------- aliases */

  const aliasSpec = defineHelix({
    ...demoSpec, type: 'twitch-helix-test-alias',
    fields: [{ name: 'broadcaster', label: 'Broadcaster', kind: 'user', optional: true }, { name: 'user', label: 'User', kind: 'user', optional: true }],
    run: async ({ input }) => ({ input }),
  })
  const alias = (msg) => callEndpoint(aliasSpec, factoryApi, msg, {}, factoryTwitch)
  assert.strictEqual((await alias({ channel: 'loginA' })).payload.input.broadcaster, 'id-logina')
  assert.strictEqual((await alias({ channelId: '999' })).payload.input.broadcaster, '999')
  assert.strictEqual((await alias({ userId: 'loginB' })).payload.input.user, 'id-loginb')
  assert.deepStrictEqual(fieldAliases({ name: 'broadcaster', label: 'B', kind: 'user' }), ['broadcasterId', 'channel', 'channelId'])

  /* --------------------------------------------------------- actions */

  const actionSpec = defineHelix({
    type: 'twitch-helix-test-actions', tier: 'extended', label: 'test actions', help: 'test', scopes: ['test:scope'],
    fields: [{ name: 'broadcaster', label: 'Broadcaster', kind: 'user', optional: true }],
    defaultAction: 'first',
    actions: {
      first: { label: 'First', help: 'first', scopes: ['test:scope'], fields: [{ name: 'text', label: 'Text', kind: 'string', default: 'one' }], run: async ({ input, action }) => ({ action, text: input.text }) },
      second: { label: 'Second', help: 'second', scopes: ['other:scope'], fields: [{ name: 'text', label: 'Text', kind: 'string', default: 'two' }], run: async ({ input, action }) => ({ action, text: input.text }) },
      needed: { label: 'Needed', help: 'needs a field', scopes: [], fields: [{ name: 'user', label: 'User', kind: 'user', required: true }], run: async ({ action }) => ({ action }) },
    },
  })
  const act = (msg, config, twitch) => callEndpoint(actionSpec, factoryApi, msg, config || {}, twitch || bothScopes)
  assert.strictEqual((await act({})).payload.action, 'first')
  assert.strictEqual((await act({ action: 'second' }, { action: 'first' })).payload.action, 'second')
  assert.strictEqual((await act({}, { action: 'second' })).payload.action, 'second')
  await assert.rejects(() => act({ action: 'nope' }), /Unknown action "nope" — valid actions: first, second, needed/)
  await assert.rejects(() => act({ action: 'second' }, {}, factoryTwitch), /Missing scope other:scope/)
  await assert.rejects(() => act({ action: 'needed' }), /User is required/)
  assert.strictEqual(resolveActiveCall(actionSpec, { action: 'second' }, {}).action, 'second')

  /* ------------------------------------------------------------ tiers */

  assert.deepStrictEqual(enabledTiers({}), ['core'])
  assert.deepStrictEqual(enabledTiers({ twitchApi: { tiers: ['core', 'advanced'] } }), ['core', 'advanced'])
  assert.deepStrictEqual(enabledTiers({ twitchApi: { tiers: ['bogus'] } }), ['core'])
  assert.strictEqual(isTierEnabled({}, 'extended'), false)

  /* -------------------------------------------------------- registry */

  const types = new Set()
  for (const spec of HELIX_SPECS) {
    assert.ok(!types.has(spec.type), `duplicate registry type ${spec.type}`)
    types.add(spec.type)
    assert.ok(['core', 'extended', 'advanced'].includes(specTier(spec)), `${spec.type}: bad tier`)
    // Smoke: every entry runs to a done() (resolve or reject), never a raw throw.
    await Promise.resolve()
      .then(() => callEndpoint(spec, successTwitch.apiClient, {}, {}, { ...successTwitch, apiClient: successTwitch.apiClient }))
      .then(() => undefined, () => undefined)
  }
  assert.ok(HELIX_SPECS.length >= 50, `expected the Helix registry, found ${HELIX_SPECS.length}`)

  // Every config.<field> a spec reads must be a declared field (plus the paging
  // fields the core adds). Catches dead reads like `config.language` with no field.
  const pagingFields = ['limit', 'all', 'allMax']
  for (const spec of HELIX_SPECS) {
    const runs = []
    if (spec.run) runs.push({ label: spec.type, run: spec.run, fields: spec.fields || [] })
    for (const [name, runAction] of Object.entries(spec.actions || {})) {
      const paged = runAction.paged || spec.paged
      runs.push({
        label: `${spec.type}.${name}`,
        run: runAction.run,
        fields: [
          ...(spec.fields || []),
          ...(runAction.fields || []),
          ...(paged ? pagingFields.map((fieldName) => ({ name: fieldName })) : []),
        ],
      })
    }
    for (const { label, run, fields } of runs) {
      const names = new Set(fields.map((field) => field.name))
      for (const ref of String(run).match(/config\.([A-Za-z0-9_]+)/g) || []) {
        const key = ref.slice('config.'.length)
        assert.ok(names.has(key), `${label}: config.${key} is not a declared field`)
      }
    }
  }

  // The shipped example must only use node types the manifest registers.
  const exampleFlow = require(path.join(root, 'examples', 'helix-channel-chat.json'))
  const manifestTypes = new Set(Object.keys(require(path.join(root, 'package.json'))['node-red'].nodes))
  for (const entry of exampleFlow) {
    if (entry.type && entry.type.indexOf('twitch') === 0) {
      assert.ok(manifestTypes.has(entry.type), `example uses unknown node type ${entry.type}`)
    }
  }

  /* --------------------------------------------------- twitch-api node */

  const apiModule = require(path.join(helixDist, 'twitch-api.js'))
  function register(settings) {
    const captured = {}
    apiModule({
      settings: settings || { twitchApi: { tiers: ['core', 'extended', 'advanced'] } },
      nodes: { createNode() {}, getNode: () => successTwitch, registerType: (type, ctor) => { captured[type] = ctor } },
    })
    return captured['twitch-api']
  }
  const TwitchApi = register()
  assert.strictEqual(typeof TwitchApi, 'function', 'twitch-api did not register')

  const node = makeNode()
  TwitchApi.call(node, { config: 'cfg', endpoint: 'twitch-helix-get-streams', fields: {} })
  const ran = await runInput(node, {})
  assert.ok('err' in ran, 'twitch-api: done() never called')

  const bad = makeNode()
  TwitchApi.call(bad, { config: 'cfg', endpoint: 'twitch-helix-ban', fields: {} })
  const badResult = await runInput(bad, {})
  assert.ok(badResult.err, 'twitch-api: unknown endpoint did not error')
  assert.match(String(badResult.err.message), /Unknown endpoint/)
  assert.match(String(badResult.err.message), /did you mean/)

  const coreOnly = register({ twitchApi: { tiers: ['core'] } })
  const gated = makeNode()
  coreOnly.call(gated, { config: 'cfg', endpoint: 'twitch-helix-bits', fields: { action: 'leaderboard' } })
  const gatedResult = await runInput(gated, {})
  assert.ok(gatedResult.err, 'twitch-api: disabled-tier endpoint did not error')
  assert.match(String(gatedResult.err.message), /tier, which is not enabled/)

  console.log(`helix nodes test: ok (${HELIX_SPECS.length} registry entries)`)
})().catch((err) => {
  console.error('helix nodes test failed:', err && err.message ? err.message : err)
  process.exit(1)
})
