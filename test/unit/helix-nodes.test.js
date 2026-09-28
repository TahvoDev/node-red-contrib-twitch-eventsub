#!/usr/bin/env node
'use strict'

/**
 * Helix nodes test.
 *
 * Runs the shared coercion/resolution helpers, the spec factory (coercion,
 * precedence, login→ID resolution + caching, scopes, error mapping, paging,
 * message preservation) and a data-driven smoke test over every spec: the
 * generated node module + editor html exist, the type registers, a missing
 * config node is reported, and garbage input never throws out of the node —
 * it ends in done(err) with a red status.
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
const { makeHandler, resolveActiveCall, enabledTiers, isTierEnabled } = require(path.join(helixDist, 'factory.js'))
const { defineHelix, specTier, actionNames } = require(path.join(helixDist, 'define.js'))
const { HELIX_SPECS } = require(path.join(helixDist, 'specs', 'index.js'))

const {
  toStr,
  toInt,
  toBool,
  toIdList,
  firstDefined,
  clampLimit,
  fetchAllPages,
  helixErrorMessage,
  shortStatus,
  resolveUserId,
  requireScopes,
  resolveAnnounceColor,
  clearUserCache,
  MAX_TIMEOUT_SECONDS,
  mapUser,
  mapChannel,
  mapChatter,
  mapBan,
  mapModerator,
  mapUserRelation,
  mapBlockedTerm,
  mapAutoModStatus,
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
assert.strictEqual(toInt('', 5), 5)

assert.strictEqual(toBool('on'), true)
assert.strictEqual(toBool('off'), false)
assert.strictEqual(toBool(0), false)
assert.strictEqual(toBool(''), undefined)

assert.deepStrictEqual(toIdList('a, b c'), ['a', 'b', 'c'])
assert.deepStrictEqual(toIdList(['x', 'y']), ['x', 'y'])
assert.deepStrictEqual(toIdList(Buffer.from('z')), ['z'])
assert.deepStrictEqual(toIdList(null), [])

assert.strictEqual(firstDefined(null, undefined, 'x', 'y'), 'x')
assert.strictEqual(clampLimit(500), 100)
assert.strictEqual(clampLimit(0), 1)

const longStatus = shortStatus('a very long status line that goes past forty characters')
assert.strictEqual(longStatus.length, 40)

assert.match(helixErrorMessage({ statusCode: 401 }), /re-authenticate/)
assert.match(helixErrorMessage({ statusCode: 403, body: '{"message":"no"}' }), /403\): no/)
assert.match(helixErrorMessage({ statusCode: 429 }), /rate limit/)
assert.strictEqual(helixErrorMessage(new Error('plain')), 'plain')

assert.deepStrictEqual(mapChatter({ userId: 'u', userName: 'n', userDisplayName: 'N' }), {
  userId: 'u', userName: 'n', userDisplayName: 'N',
})
assert.strictEqual(mapBan({ expiryDate: null }).isPermanent, true)
assert.deepStrictEqual(mapAutoModStatus({ messageId: 'm', isPermitted: false }), { messageId: 'm', isPermitted: false })
assert.strictEqual(mapUserRelation({ id: 'u', name: 'n', displayName: 'N' }).displayName, 'N')
assert.strictEqual(mapBlockedTerm({ id: 't', text: 'x' }).expirationDate, null)
assert.strictEqual(mapChannel(null), null)
assert.strictEqual(mapModerator({ userId: 'u' }).userId, 'u')
assert.strictEqual(mapUser({ id: '1' }).id, '1')
assert.strictEqual(MAX_TIMEOUT_SECONDS, 1209600)
assert.strictEqual(resolveAnnounceColor({ announceColor: 'purple' }, {}), 'purple')

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
  return new Proxy(fn, {
    get: (_t, prop) => (prop === 'then' ? undefined : deepProxy()),
    apply: () => deepProxy(),
  })
}

function registerNode(type, twitchConfig, settings) {
  const captured = {}
  const RED = {
    settings: settings || { twitchApi: { tiers: ['core', 'extended', 'advanced'] } },
    nodes: {
      createNode() {},
      getNode: () => twitchConfig,
      registerType: (registeredType, ctor) => { captured[registeredType] = ctor },
    },
  }
  require(path.join(helixDist, 'generated', `${type}.js`))(RED)
  return captured[type]
}

const successTwitch = {
  userId: '1001',
  config: { twitch_user_id: '1001' },
  initAuth: async () => {},
  getAuthProvider: () => ({ getCurrentScopesForUser: () => [] }),
  apiClient: new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'asUser') return async (_id, fn) => fn(deepProxy())
      return deepProxy()
    },
    apply: () => deepProxy(),
  }),
}

/* ----------------------------------------------------------- base node */

const baseConfig = { config: 'cfg' }
const baseNode = makeNode()
createHelixNode({ nodes: { createNode() {}, getNode: () => successTwitch } }, baseNode, baseConfig, async () => ({ id: 'x' }))
;(async () => {
  const happy = await runInput(baseNode, { payload: 'old', keep: true })
  assert.strictEqual(happy.err, undefined)
  assert.deepStrictEqual(happy.sent[0].payload, { id: 'x' })
  assert.strictEqual(happy.sent[0].keep, true)

  const envelopeNode = makeNode()
  createHelixNode({ nodes: { createNode() {}, getNode: () => successTwitch } }, envelopeNode, baseConfig, async () => ({
    payload: [1, 2],
    extra: { pagination: { cursor: 'next' }, total: 2 },
  }))
  const paged = await runInput(envelopeNode, {})
  assert.deepStrictEqual(paged.sent[0].pagination, { cursor: 'next' })
  assert.strictEqual(paged.sent[0].total, 2)

  const missing = makeNode()
  createHelixNode({ nodes: { createNode() {}, getNode: () => undefined } }, missing, baseConfig, async () => null)
  assert.match(String(missing.errors[0]), /No Twitch Config node/)

  const httpNode = makeNode()
  createHelixNode({ nodes: { createNode() {}, getNode: () => successTwitch } }, httpNode, baseConfig, async () => {
    throw { statusCode: 403, body: '{"message":"no permission"}' }
  })
  const httpErr = await runInput(httpNode, {})
  assert.match(httpErr.err.message, /403/)
  assert.strictEqual(httpNode.statuses[httpNode.statuses.length - 1].fill, 'red')

  /* --------------------------------------------------------- factory */

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

  const demoSpec = defineHelix({
    type: 'twitch-helix-test-demo',
    label: 'test demo',
    help: 'test',
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
  const demoHandler = makeHandler(demoSpec)

  // Precedence: msg > config > default; payload overrides a primary field.
  const one = await demoHandler(factoryApi, { text: 'fromMsg', primaryText: 'fromConfig' }, { text: 'fromConfig', num: '9', pick: 'zzz', who: 'loginA', primaryText: 'configPrimary' }, factoryTwitch)
  assert.strictEqual(one.payload.input.text, 'fromMsg')
  assert.strictEqual(one.payload.input.num, 9)
  // Unknown select falls back to the default.
  assert.strictEqual(one.payload.input.pick, 'a')
  // Login resolved with the shared cache.
  assert.strictEqual(one.payload.input.who, 'id-logina')
  assert.strictEqual(one.payload.broadcasterId, '1001')
  const two = await demoHandler(factoryApi, { who: 'loginA' }, {}, factoryTwitch)
  assert.strictEqual(factoryCalls.filter((n) => n === 'logina').length, 1, 'login lookup cached')
  // msg.payload overrides the primary field.
  const three = await demoHandler(factoryApi, { payload: 'fromPayload' }, {}, factoryTwitch)
  assert.strictEqual(three.payload.input.primaryText, 'fromPayload')
  // Coercion of Buffer/boolean/null.
  const four = await demoHandler(factoryApi, { text: Buffer.from(' buf '), flag: null, ids: '1,2' }, {}, factoryTwitch)
  assert.strictEqual(four.payload.input.text, 'buf')
  assert.strictEqual(four.payload.input.flag, false)
  assert.deepStrictEqual(four.payload.input.ids, ['1', '2'])

  // Missing scope.
  const scopedSpec = defineHelix({ ...demoSpec, type: 'twitch-helix-test-scope', scopes: ['needed:scope'] })
  await assert.rejects(
    () => makeHandler(scopedSpec)(factoryApi, {}, {}, factoryTwitch),
    /Missing scope needed:scope/
  )

  // Required field.
  const requiredSpec = defineHelix({
    ...demoSpec,
    type: 'twitch-helix-test-req',
    fields: [{ name: 'user', label: 'User', kind: 'user', required: true }],
  })
  await assert.rejects(() => makeHandler(requiredSpec)(factoryApi, {}, {}, factoryTwitch), /User is required/)

  // Paging: single page and get-all with cap.
  const pagedSpec = defineHelix({
    ...demoSpec,
    type: 'twitch-helix-test-paged',
    fields: [{ name: 'broadcaster', label: 'Broadcaster', kind: 'user', optional: true }],
    paged: { limit: 20, max: 4 },
    run: async ({ input }) => {
      const start = input.after ? Number(input.after) : 1
      return { data: [start, start + 1], cursor: String(start + 2), total: 10 }
    },
    map: (item) => ({ n: item }),
  })
  const pagedHandler = makeHandler(pagedSpec)
  const pageOne = await pagedHandler(factoryApi, {}, {}, factoryTwitch)
  assert.deepStrictEqual(pageOne.payload, [{ n: 1 }, { n: 2 }])
  assert.deepStrictEqual(pageOne.extra.pagination, { cursor: '3' })
  assert.strictEqual(pageOne.extra.total, 10)
  const pageAll = await pagedHandler(factoryApi, { all: true }, {}, factoryTwitch)
  assert.deepStrictEqual(pageAll.payload.map((p) => p.n), [1, 2, 3, 4])

  // fetchAllPages stops at the cap and keeps the continuation cursor.
  let page = 0
  const walked = await fetchAllPages(async () => { page++; return { data: [page], cursor: page < 5 ? `c${page}` : null } }, 3)
  assert.deepStrictEqual(walked.data, [1, 2, 3])
  assert.strictEqual(walked.cursor, 'c3')

  /* ----------------------------------------------------- action nodes */

  const actionSpec = defineHelix({
    type: 'twitch-helix-test-actions',
    label: 'test actions',
    help: 'test',
    tier: 'extended',
    scopes: ['test:scope'],
    fields: [{ name: 'broadcaster', label: 'Broadcaster', kind: 'user', optional: true }],
    defaultAction: 'first',
    actions: {
      first: {
        label: 'First',
        help: 'first',
        scopes: ['test:scope'],
        fields: [{ name: 'text', label: 'Text', kind: 'string', default: 'one' }],
        run: async ({ input, action }) => ({ action, text: input.text }),
      },
      second: {
        label: 'Second',
        help: 'second',
        scopes: ['other:scope'],
        fields: [{ name: 'text', label: 'Text', kind: 'string', default: 'two' }],
        run: async ({ input, action }) => ({ action, text: input.text }),
      },
      needed: {
        label: 'Needed',
        help: 'needs a field',
        scopes: [],
        fields: [{ name: 'user', label: 'User', kind: 'user', required: true }],
        run: async ({ action }) => ({ action }),
      },
    },
  })
  const bothScopes = {
    ...factoryTwitch,
    getAuthProvider: () => ({ getCurrentScopesForUser: () => ['test:scope', 'other:scope'] }),
  }

  // Default action resolves when msg.action and config.action are blank.
  const act1 = await makeHandler(actionSpec)(factoryApi, {}, {}, bothScopes)
  assert.strictEqual(act1.payload.action, 'first')
  assert.strictEqual(act1.payload.text, 'one')
  // msg.action beats config.action.
  const act2 = await makeHandler(actionSpec)(factoryApi, { action: 'second' }, { action: 'first' }, bothScopes)
  assert.strictEqual(act2.payload.action, 'second')
  assert.strictEqual(act2.payload.text, 'two')
  // config.action is used when the message has none.
  const act3 = await makeHandler(actionSpec)(factoryApi, {}, { action: 'second' }, bothScopes)
  assert.strictEqual(act3.payload.action, 'second')
  // An unknown action names the valid ones.
  await assert.rejects(
    () => makeHandler(actionSpec)(factoryApi, { action: 'nope' }, {}, bothScopes),
    /Unknown action "nope" — valid actions: first, second, needed/
  )
  // Scopes are checked for the selected action, not the node.
  await assert.rejects(
    () => makeHandler(actionSpec)(factoryApi, { action: 'second' }, {}, factoryTwitch),
    /Missing scope other:scope/
  )
  // Required-field validation uses the selected action's fields.
  await assert.rejects(
    () => makeHandler(actionSpec)(factoryApi, { action: 'needed' }, {}, bothScopes),
    /User is required/
  )
  // The editor metadata resolves the selected action's field set.
  const resolved = resolveActiveCall(actionSpec, { action: 'second' }, {})
  assert.strictEqual(resolved.action, 'second')
  assert.deepStrictEqual(resolved.fields.map((f) => f.name), ['broadcaster', 'text'])

  /* ------------------------------------------------------------ tiers */

  assert.deepStrictEqual(enabledTiers({}), ['core'])
  assert.deepStrictEqual(enabledTiers({ twitchApi: { tiers: ['core', 'advanced'] } }), ['core', 'advanced'])
  assert.deepStrictEqual(enabledTiers({ twitchApi: { tiers: ['bogus'] } }), ['core'])
  assert.strictEqual(isTierEnabled({}, 'core'), true)
  assert.strictEqual(isTierEnabled({}, 'extended'), false)

  /* ---------------------------------------------- data-driven per spec */

  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const manifest = pkg['node-red'].nodes
  const paletteSpecs = HELIX_SPECS.filter((spec) => spec.palette !== false)
  assert.ok(HELIX_SPECS.length >= 30, `expected at least 30 Helix specs, found ${HELIX_SPECS.length}`)
  assert.ok(paletteSpecs.length >= 25 && paletteSpecs.length <= 32, `expected about 30 palette nodes, found ${paletteSpecs.length}`)
  assert.ok(paletteSpecs.filter((spec) => specTier(spec) === 'core').length <= 15, 'core palette should be at most 15 nodes')

  for (const spec of HELIX_SPECS) {
    const generatedJs = path.join(helixDist, 'generated', `${spec.type}.js`)
    const generatedHtml = path.join(helixDist, 'generated', `${spec.type}.html`)
    assert.ok(fs.existsSync(generatedJs), `${spec.type}: generated js missing (build first)`)
    assert.ok(fs.existsSync(generatedHtml), `${spec.type}: generated html missing`)

    const html = fs.readFileSync(generatedHtml, 'utf8')
    assert.match(html, /category:\s*"twitch api"/, `${spec.type}: wrong palette category`)
    assert.ok(html.includes(`data-template-name="${spec.type}"`), `${spec.type}: no editor template`)
    assert.ok(html.includes(`data-help-name="${spec.type}"`), `${spec.type}: no help block`)

    // Action nodes get an action dropdown and per-action field toggling.
    if (spec.actions) {
      assert.ok(html.includes('id="node-input-action"'), `${spec.type}: no action dropdown`)
      for (const name of actionNames(spec)) {
        assert.ok(html.includes(`value="${name}"`), `${spec.type}: missing action option ${name}`)
      }
      assert.ok(html.includes('data-action='), `${spec.type}: action fields are not toggleable`)
    }

    // The manifest points at the generated module and the file exists.
    assert.strictEqual(manifest[spec.type], `dist/twitch/helix/generated/${spec.type}.js`, `${spec.type}: manifest entry wrong`)
    assert.ok(fs.existsSync(path.join(root, manifest[spec.type])), `${spec.type}: manifest file missing`)

    const ctor = registerNode(spec.type, successTwitch)

    // Hidden specs stay registered-but-hidden: the stub must not claim a type.
    if (spec.palette === false) {
      assert.strictEqual(ctor, undefined, `${spec.type}: hidden spec should not register a palette node`)
      continue
    }

    assert.strictEqual(typeof ctor, 'function', `${spec.type}: did not register`)
    const noConfigNode = makeNode()
    const noConfigCtor = registerNode(spec.type, undefined)
    noConfigCtor.call(noConfigNode, { config: 'cfg' })
    assert.ok(noConfigNode.errors.length >= 1, `${spec.type}: missing config not reported`)

    // Garbage input never escapes: done() always fires, errors set a red status.
    // Action nodes are exercised once per action.
    const actionList = spec.actions ? actionNames(spec) : [undefined]
    for (const action of actionList) {
      const node = makeNode()
      ctor.call(node, action ? { config: 'cfg', action } : { config: 'cfg' })
      const msg = action ? { action } : {}
      const result = await runInput(node, msg)
      assert.ok('err' in result, `${spec.type}${action ? '/' + action : ''}: done() never called`)
      if (result.err) {
        const last = node.statuses[node.statuses.length - 1]
        assert.strictEqual(last && last.fill, 'red', `${spec.type}${action ? '/' + action : ''}: error without red status`)
      }
    }
  }

  // Tier gating: a disabled tier's node does not register.
  const coreSpec = paletteSpecs.find((spec) => specTier(spec) === 'core')
  const extendedSpec = paletteSpecs.find((spec) => specTier(spec) === 'extended')
  assert.ok(coreSpec && extendedSpec, 'expected at least one core and one extended spec')
  assert.strictEqual(typeof registerNode(coreSpec.type, successTwitch, {}), 'function')
  assert.strictEqual(registerNode(extendedSpec.type, successTwitch, {}), undefined)
  assert.strictEqual(
    typeof registerNode(extendedSpec.type, successTwitch, { twitchApi: { tiers: ['core', 'extended'] } }),
    'function'
  )

  /* --------------------------------------------- generic request node */

  const genericModule = require(path.join(helixDist, 'twitch-helix-api-request.js'))
  const genericCaptured = {}
  genericModule({
    settings: { twitchApi: { tiers: ['core', 'extended', 'advanced'] } },
    nodes: {
      createNode() {},
      getNode: () => successTwitch,
      registerType: (type, ctor) => { genericCaptured[type] = ctor },
    },
  })
  const GenericCtor = genericCaptured['twitch-helix-api-request']
  assert.strictEqual(typeof GenericCtor, 'function', 'generic node did not register')

  // Endpoint and action resolve from config, then msg overrides them.
  const genericSpec = paletteSpecs.find((spec) => spec.actions && specTier(spec) !== 'advanced')
  const genericNode = makeNode()
  GenericCtor.call(genericNode, { config: 'cfg', endpoint: genericSpec.type, action: genericSpec.defaultAction })
  const genericOk = await runInput(genericNode, { action: Object.keys(genericSpec.actions)[1] })
  assert.ok('err' in genericOk, 'generic node: done() never called')

  // Unknown endpoint names close matches instead of throwing raw.
  const genericBad = makeNode()
  GenericCtor.call(genericBad, { config: 'cfg', endpoint: 'twitch-helix-bnas' })
  const genericBadResult = await runInput(genericBad, {})
  assert.ok(genericBadResult.err, 'generic node: unknown endpoint did not error')
  assert.match(String(genericBadResult.err.message), /Unknown endpoint/)
  assert.match(String(genericBadResult.err.message), /did you mean/)

  // An endpoint from a disabled tier is refused at runtime.
  const advancedCtor = (() => {
    // Re-register the generic under a core-only host to check the runtime guard.
    const captured = {}
    genericModule({
      settings: { twitchApi: { tiers: ['core'] } },
      nodes: {
        createNode() {},
        getNode: () => successTwitch,
        registerType: (type, ctor) => { captured[type] = ctor },
      },
    })
    return captured['twitch-helix-api-request']
  })()
  const tierNode = makeNode()
  advancedCtor.call(tierNode, { config: 'cfg', endpoint: extendedSpec.type })
  const tierResult = await runInput(tierNode, {})
  assert.ok(tierResult.err, 'generic node: disabled-tier endpoint did not error')
  assert.match(String(tierResult.err.message), /tier, which is not enabled/)

  console.log(`helix nodes test: ok (${HELIX_SPECS.length} specs, ${paletteSpecs.length} palette)`)
})().catch((err) => {
  console.error('helix nodes test failed:', err && err.message ? err.message : err)
  process.exit(1)
})
