#!/usr/bin/env node
'use strict'

/**
 * Helix nodes test.
 *
 * Covers the shared coercion/resolution helpers, the base node's message
 * handling (envelope merging, status, done(err)) and one real node end to end
 * against a mocked API client. Runs against the built dist/ output; any failed
 * assert throws and exits non-zero, failing `npm run test:unit`, `npm run check`
 * and `npm run build`.
 */

const assert = require('assert')
const path = require('path')
const fs = require('fs')
const EventEmitter = require('events')

const dist = path.join(__dirname, '..', '..', 'dist')
const utils = require(path.join(dist, 'twitch', 'helix', 'twitch-helix-utils.js'))
const { createHelixNode } = require(path.join(dist, 'twitch', 'helix', 'twitch-helix-base.js'))

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
  mapFollowedChannel,
  mapSentMessage,
  mapBan,
  mapModerator,
  mapUserRelation,
  mapWarning,
  mapBlockedTerm,
  mapAutoModStatus,
} = utils

/* ------------------------------------------------------------- coercion */

assert.strictEqual(toStr('  hi  '), 'hi')
assert.strictEqual(toStr(42), '42')
assert.strictEqual(toStr(true), 'true')
assert.strictEqual(toStr(Buffer.from('buf')), 'buf')
assert.strictEqual(toStr('   '), undefined)
assert.strictEqual(toStr(null), undefined)
assert.strictEqual(toStr(undefined), undefined)
// An object or array must not become "[object Object]".
assert.strictEqual(toStr({ a: 1 }), undefined)
assert.strictEqual(toStr([1, 2]), undefined)

assert.strictEqual(toInt('20'), 20)
assert.strictEqual(toInt(20.9), 20)
assert.strictEqual(toInt(0), 0)
assert.strictEqual(toInt('nope', 5), 5)
assert.strictEqual(toInt('', 5), 5)
assert.strictEqual(toInt(null, 5), 5)

assert.strictEqual(toBool(true), true)
assert.strictEqual(toBool('on'), true)
assert.strictEqual(toBool('YES'), true)
assert.strictEqual(toBool('1'), true)
assert.strictEqual(toBool(0), false)
assert.strictEqual(toBool('off'), false)
assert.strictEqual(toBool(''), undefined)
assert.strictEqual(toBool(undefined, true), true)

assert.deepStrictEqual(toIdList('a, b, c'), ['a', 'b', 'c'])
assert.deepStrictEqual(toIdList('1 2'), ['1', '2'])
assert.deepStrictEqual(toIdList(['x', 'y']), ['x', 'y'])
assert.deepStrictEqual(toIdList(5), ['5'])
assert.deepStrictEqual(toIdList(Buffer.from('z')), ['z'])
assert.deepStrictEqual(toIdList(null), [])
assert.deepStrictEqual(toIdList(''), [])

assert.strictEqual(firstDefined(null, undefined, 'x', 'y'), 'x')
assert.strictEqual(firstDefined(undefined, undefined), undefined)

assert.strictEqual(clampLimit(undefined), 20)
assert.strictEqual(clampLimit('30'), 30)
assert.strictEqual(clampLimit(0), 1)
assert.strictEqual(clampLimit(500), 100)

const longStatus = shortStatus('a very long status line that goes past forty characters')
assert.strictEqual(longStatus.length, 40)
assert.ok(longStatus.endsWith('…'))
assert.ok(longStatus.startsWith('a very long'))
assert.strictEqual(shortStatus('line one\nline two'), 'line one')

/* --------------------------------------------------------------- errors */

assert.match(helixErrorMessage({ statusCode: 401 }), /re-authenticate/)
assert.match(helixErrorMessage({ statusCode: 403, body: '{"message":"missing"}' }), /403\): missing/)
assert.match(helixErrorMessage({ statusCode: 429 }), /rate limit/)
assert.match(helixErrorMessage({ statusCode: 400, body: 'oops' }), /400/)
assert.strictEqual(helixErrorMessage(new Error('plain problem')), 'plain problem')

/* ------------------------------------------------------------- identity */

;(async () => {
  clearUserCache()
  const lookup = { users: { getUserByName: async (n) => ({ id: `id-${n}` }) } }
  assert.strictEqual(await resolveUserId(lookup, '12345'), '12345')
  assert.strictEqual(await resolveUserId(lookup, 99), '99')

  let hits = 0
  const counting = { users: { getUserByName: async (n) => { hits++; return { id: `id-${n}` } } } }
  assert.strictEqual(await resolveUserId(counting, 'Shroud'), 'id-shroud')
  assert.strictEqual(await resolveUserId(counting, 'shroud'), 'id-shroud')
  assert.strictEqual(hits, 1, 'a login lookup should be cached')

  await assert.rejects(() => resolveUserId(lookup, ''), /A user is required/)
  await assert.rejects(
    () => resolveUserId({ users: { getUserByName: async () => null } }, 'ghost'),
    /could not be found/
  )

  // Scopes: a non-empty scope list missing one throws; an empty list skips the check.
  const withScopes = (scopes) => ({ getAuthProvider: () => ({ getCurrentScopesForUser: () => scopes }) })
  assert.doesNotThrow(() => requireScopes(withScopes(['a', 'b']), ['a']))
  assert.throws(() => requireScopes(withScopes(['a']), ['a', 'b']), /Missing scope b/)
  assert.doesNotThrow(() => requireScopes(withScopes([]), ['b']))
  assert.doesNotThrow(() => requireScopes({}, ['b']))

  // Paging: walks pages and stops at the cap.
  let page = 0
  const result = await fetchAllPages(async () => {
    page++
    return { data: [page, page + 100], cursor: page < 5 ? `c${page}` : null, total: 10 }
  }, 5)
  assert.deepStrictEqual(result.data, [1, 101, 2, 102, 3])
  assert.strictEqual(result.cursor, 'c3')
  assert.strictEqual(result.total, 10)

  /* ------------------------------------------------------------- mappers */

  assert.deepStrictEqual(mapUser({ id: '1', name: 'n', displayName: 'N' }), {
    id: '1', name: 'n', displayName: 'N', profilePictureUrl: undefined,
    description: undefined, broadcasterType: undefined, creationDate: undefined,
  })
  assert.strictEqual(mapChannel(null), null)
  assert.deepStrictEqual(mapChatter({ userId: 'u', userName: 'n', userDisplayName: 'N' }), {
    userId: 'u', userName: 'n', userDisplayName: 'N',
  })
  const followed = mapFollowedChannel({ broadcasterId: 'b', broadcasterName: 'n', broadcasterDisplayName: 'N', followDate: new Date(0) })
  assert.strictEqual(followed.broadcasterId, 'b')
  assert.deepStrictEqual(mapSentMessage({ id: 'm', isSent: true }), {
    id: 'm', isSent: true, dropReasonCode: null, dropReasonMessage: null,
  })

  const ban = mapBan({ userId: 'u', userName: 'n', expiryDate: null })
  assert.strictEqual(ban.userId, 'u')
  assert.strictEqual(ban.isPermanent, true)
  assert.strictEqual(ban.expiryDate, null)
  assert.strictEqual(mapBan({ expiryDate: new Date(0) }).isPermanent, false)
  assert.deepStrictEqual(mapModerator({ userId: 'u', userName: 'n', userDisplayName: 'N' }), {
    userId: 'u', userName: 'n', userDisplayName: 'N',
  })
  assert.deepStrictEqual(mapUserRelation({ id: 'u', name: 'n', displayName: 'N' }), {
    id: 'u', name: 'n', displayName: 'N',
  })
  assert.deepStrictEqual(mapWarning({ broadcasterId: 'b', moderatorId: 'm', userId: 'u', reason: 'r' }), {
    broadcasterId: 'b', moderatorId: 'm', userId: 'u', reason: 'r',
  })
  assert.strictEqual(mapBlockedTerm({ id: 't', text: 'x' }).expirationDate, null)
  assert.deepStrictEqual(mapAutoModStatus({ messageId: 'm', isPermitted: false }), {
    messageId: 'm', isPermitted: false,
  })
  assert.strictEqual(MAX_TIMEOUT_SECONDS, 1209600)

  assert.strictEqual(resolveAnnounceColor({ color: '#FF0000' }, {}), 'primary')
  assert.strictEqual(resolveAnnounceColor({ announceColor: 'purple' }, {}), 'purple')
  assert.strictEqual(resolveAnnounceColor({}, { color: 'blue' }), 'blue')

  /* ---------------------------------------------------------- base node */

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

  const apiClient = { users: {} }
  const config = { config: 'cfg' }

  // A plain return becomes msg.payload, other properties survive, status clears.
  const twitchConfig = { apiClient, initAuth: async () => {} }
  const node = makeNode()
  createHelixNode({ nodes: { createNode() {}, getNode: () => twitchConfig } }, node, config, async () => ({ id: 'x' }))
  const happy = await runInput(node, { payload: 'old', keep: true })
  assert.strictEqual(happy.err, undefined)
  assert.deepStrictEqual(happy.sent[0].payload, { id: 'x' })
  assert.strictEqual(happy.sent[0].keep, true)
  assert.deepStrictEqual(node.statuses[node.statuses.length - 1], {})

  // { payload, extra } merges the extra properties onto the message.
  const node2 = makeNode()
  createHelixNode({ nodes: { createNode() {}, getNode: () => twitchConfig } }, node2, config, async () => ({
    payload: [1, 2],
    extra: { pagination: { cursor: 'next' }, total: 2 },
  }))
  const paged = await runInput(node2, {})
  assert.deepStrictEqual(paged.sent[0].payload, [1, 2])
  assert.deepStrictEqual(paged.sent[0].pagination, { cursor: 'next' })
  assert.strictEqual(paged.sent[0].total, 2)

  // A missing config node is reported and no input listener is wired.
  const node3 = makeNode()
  createHelixNode({ nodes: { createNode() {}, getNode: () => undefined } }, node3, config, async () => null)
  assert.match(String(node3.errors[0]), /No Twitch Config node/)

  // A handler error maps to a short status and done(err).
  const node4 = makeNode()
  createHelixNode({ nodes: { createNode() {}, getNode: () => twitchConfig } }, node4, config, async () => {
    throw { statusCode: 403, body: '{"message":"no permission"}' }
  })
  const failed = await runInput(node4, {})
  assert.ok(failed.err instanceof Error)
  assert.match(failed.err.message, /403/)
  assert.match(failed.err.message, /no permission/)
  const lastStatus = node4.statuses[node4.statuses.length - 1]
  assert.strictEqual(lastStatus.fill, 'red')
  assert.match(lastStatus.text, /403/)

  // An unauthenticated config node fails before the handler runs.
  const node5 = makeNode()
  createHelixNode({ nodes: { createNode() {}, getNode: () => ({ initAuth: async () => {} }) } }, node5, config, async () => null)
  const noAuth = await runInput(node5, {})
  assert.match(noAuth.err.message, /not ready/)

  /* ------------------------------------------------ send-chat-message node */

  const calls = []
  const chatApiClient = {
    users: { getUserByName: async (n) => ({ id: `id-${n}` }) },
    asUser: async (id, fn) => fn({
      chat: {
        sendChatMessage: async (broadcaster, text, options) => {
          calls.push({ id, broadcaster, text, options })
          return { id: 'sent1', isSent: true }
        },
      },
    }),
  }

  const sendRed = {
    nodes: {
      createNode() {},
      getNode: () => ({
        userId: '1001', config: { twitch_user_id: '1001' }, initAuth: async () => {}, apiClient: chatApiClient,
      }),
    },
  }
  const registered2 = {}
  sendRed.nodes.registerType = (type, ctor) => { registered2[type] = ctor }
  require(path.join(dist, 'twitch', 'helix', 'twitch-helix-send-chat-message.js'))(sendRed)
  const node6 = makeNode()
  registered2['twitch-helix-send-chat-message'].call(node6, { config: 'cfg', message: 'node text' })
  const sent = await runInput(node6, { payload: 'payload text' })
  assert.strictEqual(sent.err, undefined)
  assert.strictEqual(calls[0].text, 'payload text')
  assert.strictEqual(calls[0].broadcaster, '1001')
  assert.strictEqual(calls[0].id, '1001')
  assert.deepStrictEqual(sent.sent[0].payload, { id: 'sent1', isSent: true, dropReasonCode: null, dropReasonMessage: null })

  // Missing scope on the send node fails with an actionable message.
  const missingScopeRed = {
    nodes: {
      createNode() {},
      getNode: () => ({
        userId: '1001', config: { twitch_user_id: '1001' }, initAuth: async () => {}, apiClient: chatApiClient,
        getAuthProvider: () => ({ getCurrentScopesForUser: () => ['chat:read'] }),
      }),
      registerType: () => {},
    },
  }
  const registered3 = {}
  missingScopeRed.nodes.registerType = (type, ctor) => { registered3[type] = ctor }
  delete require.cache[require.resolve(path.join(dist, 'twitch', 'helix', 'twitch-helix-send-chat-message.js'))]
  require(path.join(dist, 'twitch', 'helix', 'twitch-helix-send-chat-message.js'))(missingScopeRed)
  const node7 = makeNode()
  registered3['twitch-helix-send-chat-message'].call(node7, { config: 'cfg' })
  const scopeErr = await runInput(node7, { payload: 'hi' })
  assert.match(scopeErr.err.message, /Missing scope user:write:chat/)

  /* --------------------------------------------------- paged node + coercion */

  const followerCalls = []
  const followerApiClient = {
    users: { getUserByName: async (n) => ({ id: `id-${n}` }) },
    asUser: async (id, fn) => fn({
      channels: {
        getChannelFollowers: async (broadcaster, user, opts) => {
          followerCalls.push({ broadcaster, user, opts })
          return { data: [{ userId: 'f1', userName: 'ann', userDisplayName: 'Ann', followDate: 123 }], cursor: 'next', total: 1 }
        },
      },
    }),
  }
  const followerRed = {
    nodes: {
      createNode() {},
      getNode: () => ({
        userId: '1001', config: { twitch_user_id: '1001' }, initAuth: async () => {}, apiClient: followerApiClient,
        getAuthProvider: () => ({ getCurrentScopesForUser: () => ['moderator:read:followers'] }),
      }),
      registerType: (type, ctor) => { followerRed._type = ctor },
    },
  }
  delete require.cache[require.resolve(path.join(dist, 'twitch', 'helix', 'twitch-helix-get-followers.js'))]
  require(path.join(dist, 'twitch', 'helix', 'twitch-helix-get-followers.js'))(followerRed)
  const node8 = makeNode()
  followerRed._type.call(node8, { config: 'cfg', limit: 2 })
  // String, Buffer and numeric overrides all coerce; the channel login is resolved.
  const followerMsg = { broadcaster: Buffer.from('somechannel'), limit: '5' }
  const followerResult = await runInput(node8, followerMsg)
  assert.strictEqual(followerResult.err, undefined)
  assert.strictEqual(followerCalls[0].broadcaster, 'id-somechannel')
  assert.strictEqual(followerCalls[0].opts.limit, 5)
  assert.deepStrictEqual(followerCalls[0].opts.after, undefined)
  assert.deepStrictEqual(followerResult.sent[0].payload, [
    { userId: 'f1', userName: 'ann', userDisplayName: 'Ann', followDate: 123 },
  ])
  assert.deepStrictEqual(followerResult.sent[0].pagination, { cursor: 'next' })
  assert.strictEqual(followerResult.sent[0].total, 1)

  /* ------------------------------------------------- moderation node */

  const banCalls = []
  const modApiClient = {
    users: { getUserByName: async (n) => ({ id: `id-${n}` }) },
    asUser: async (id, fn) => fn({
      moderation: {
        banUser: async (broadcaster, request) => {
          banCalls.push({ id, broadcaster, request })
          return [{ userId: request.user, userName: 'victim', expiryDate: null }]
        },
        getBannedUsers: async (broadcaster, filter) => {
          banCalls.push({ list: broadcaster, filter })
          return { data: [], cursor: null, total: 0 }
        },
      },
    }),
  }
  const modRed = {
    nodes: {
      createNode() {},
      getNode: () => ({
        userId: '1001', config: { twitch_user_id: '1001' }, initAuth: async () => {}, apiClient: modApiClient,
        getAuthProvider: () => ({ getCurrentScopesForUser: () => ['moderator:manage:banned_users'] }),
      }),
      registerType: (type, ctor) => { modRed._types[type] = ctor },
    },
    _types: {},
  }
  require(path.join(dist, 'twitch', 'helix', 'twitch-helix-ban-user.js'))(modRed)
  const banNode = makeNode()
  modRed._types['twitch-helix-ban-user'].call(banNode, { config: 'cfg' })
  const banResult = await runInput(banNode, { user: 'victim', duration: '60', reason: 'spam' })
  assert.strictEqual(banResult.err, undefined)
  assert.strictEqual(banCalls[0].request.user, 'id-victim')
  assert.strictEqual(banCalls[0].request.duration, 60)
  assert.strictEqual(banCalls[0].request.reason, 'spam')
  assert.strictEqual(banCalls[0].id, '1001')
  assert.strictEqual(banResult.sent[0].payload.userId, 'id-victim')

  // A blank duration is a permanent ban.
  const banNode2 = makeNode()
  modRed._types['twitch-helix-ban-user'].call(banNode2, { config: 'cfg', user: '1002' })
  const permanent = await runInput(banNode2, {})
  assert.strictEqual(permanent.err, undefined)
  assert.strictEqual(banCalls[1].request.duration, undefined)

  // A non-numeric duration fails the node instead of reaching Twitch.
  const banNode3 = makeNode()
  modRed._types['twitch-helix-ban-user'].call(banNode3, { config: 'cfg', user: '1002' })
  const badDuration = await runInput(banNode3, { duration: 'soon' })
  assert.match(badDuration.err.message, /Duration must be a positive number/)

  // Missing scope fails with an actionable message.
  const modRedScope = {
    nodes: {
      createNode() {},
      getNode: () => ({
        userId: '1001', config: { twitch_user_id: '1001' }, initAuth: async () => {}, apiClient: modApiClient,
        getAuthProvider: () => ({ getCurrentScopesForUser: () => ['moderation:read'] }),
      }),
    },
    _types: {},
  }
  modRedScope.nodes.registerType = (type, ctor) => { modRedScope._types[type] = ctor }
  delete require.cache[require.resolve(path.join(dist, 'twitch', 'helix', 'twitch-helix-ban-user.js'))]
  require(path.join(dist, 'twitch', 'helix', 'twitch-helix-ban-user.js'))(modRedScope)
  const scopeNode = makeNode()
  modRedScope._types['twitch-helix-ban-user'].call(scopeNode, { config: 'cfg', user: '1002' })
  const scopeFailure = await runInput(scopeNode, {})
  assert.match(scopeFailure.err.message, /Missing scope moderator:manage:banned_users/)

  /* ------------------------------------------------- stream & content nodes */

  const streamApiClient = {
    users: { getUserByName: async (n) => ({ id: `id-${n}` }) },
    asUser: async (id, fn) => fn({
      streams: {
        createStreamMarker: async (broadcaster, description) => ({
          id: 'marker1', creationDate: new Date(0), description, positionInSeconds: 12,
        }),
      },
      channels: {
        startChannelCommercial: async (broadcaster, length) => { streamCalls.push({ broadcaster, length }) },
      },
    }),
  }
  const streamCalls = []
  const streamRed = {
    nodes: {
      createNode() {},
      getNode: () => ({
        userId: '1001', config: { twitch_user_id: '1001' }, initAuth: async () => {}, apiClient: streamApiClient,
        getAuthProvider: () => ({ getCurrentScopesForUser: () => ['channel:manage:broadcast', 'channel:edit:commercial'] }),
      }),
    },
    _types: {},
  }
  streamRed.nodes.registerType = (type, ctor) => { streamRed._types[type] = ctor }
  require(path.join(dist, 'twitch', 'helix', 'twitch-helix-create-stream-marker.js'))(streamRed)
  require(path.join(dist, 'twitch', 'helix', 'twitch-helix-start-commercial.js'))(streamRed)

  const markerNode = makeNode()
  streamRed._types['twitch-helix-create-stream-marker'].call(markerNode, { config: 'cfg' })
  const markerResult = await runInput(markerNode, { payload: 'nice moment' })
  assert.strictEqual(markerResult.err, undefined)
  assert.strictEqual(markerResult.sent[0].payload.id, 'marker1')
  assert.strictEqual(markerResult.sent[0].payload.description, 'nice moment')

  const adNode = makeNode()
  streamRed._types['twitch-helix-start-commercial'].call(adNode, { config: 'cfg' })
  const adResult = await runInput(adNode, { length: 60 })
  assert.strictEqual(adResult.err, undefined)
  assert.strictEqual(streamCalls[0].length, 60)

  const badAdNode = makeNode()
  streamRed._types['twitch-helix-start-commercial'].call(badAdNode, { config: 'cfg' })
  const badAd = await runInput(badAdNode, { length: 45 })
  assert.match(badAd.err.message, /Commercial length must be one of/)

  /* ------------------------------------------------------------ palette */

  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'))
  const newTypes = [
    'twitch-helix-add-blocked-term',
    'twitch-helix-add-moderator',
    'twitch-helix-add-vip',
    'twitch-helix-ban-user',
    'twitch-helix-cancel-raid',
    'twitch-helix-check-automod-status',
    'twitch-helix-clear-chat',
    'twitch-helix-create-clip',
    'twitch-helix-create-stream-marker',
    'twitch-helix-delete-chat-message',
    'twitch-helix-delete-videos',
    'twitch-helix-get-ad-schedule',
    'twitch-helix-get-banned-users',
    'twitch-helix-get-blocked-terms',
    'twitch-helix-get-channel-info',
    'twitch-helix-get-chat-badges',
    'twitch-helix-get-chat-settings',
    'twitch-helix-get-chatters',
    'twitch-helix-get-clips',
    'twitch-helix-get-emotes',
    'twitch-helix-get-followed-channels',
    'twitch-helix-get-followers',
    'twitch-helix-get-games',
    'twitch-helix-get-moderators',
    'twitch-helix-get-stream-key',
    'twitch-helix-get-stream-markers',
    'twitch-helix-get-top-games',
    'twitch-helix-get-videos',
    'twitch-helix-get-vips',
    'twitch-helix-remove-blocked-term',
    'twitch-helix-remove-moderator',
    'twitch-helix-remove-vip',
    'twitch-helix-search-categories',
    'twitch-helix-search-channels',
    'twitch-helix-send-announcement',
    'twitch-helix-send-chat-message',
    'twitch-helix-send-shoutout',
    'twitch-helix-snooze-next-ad',
    'twitch-helix-start-commercial',
    'twitch-helix-start-raid',
    'twitch-helix-unban-user',
    'twitch-helix-update-channel-info',
    'twitch-helix-update-chat-settings',
    'twitch-helix-warn-user',
    'twitch-helix-check-user-subscription',
    'twitch-helix-create-custom-reward',
    'twitch-helix-create-poll',
    'twitch-helix-create-prediction',
    'twitch-helix-create-segment',
    'twitch-helix-delete-custom-reward',
    'twitch-helix-delete-segment',
    'twitch-helix-end-poll',
    'twitch-helix-end-prediction',
    'twitch-helix-get-bits-leaderboard',
    'twitch-helix-get-channel-teams',
    'twitch-helix-get-charity-campaign',
    'twitch-helix-get-cheermotes',
    'twitch-helix-get-custom-rewards',
    'twitch-helix-get-goals',
    'twitch-helix-get-hype-train',
    'twitch-helix-get-polls',
    'twitch-helix-get-predictions',
    'twitch-helix-get-redemptions',
    'twitch-helix-get-schedule',
    'twitch-helix-get-subscriptions',
    'twitch-helix-get-teams',
    'twitch-helix-send-whisper',
    'twitch-helix-update-custom-reward',
    'twitch-helix-update-redemption-status',
    'twitch-helix-update-segment',
  ]
  for (const type of newTypes) {
    const file = pkg['node-red'].nodes[type]
    assert.ok(file, `${type} missing from node-red.nodes`)
    assert.ok(fs.existsSync(path.join(__dirname, '..', '..', file)), `${file} not built`)
    const html = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'twitch', 'helix', `${type}.html`), 'utf8')
    assert.match(html, /category:\s*'twitch api'/)
    assert.ok(html.includes(`data-template-name="${type}"`), `${type} has no editor template`)
    assert.ok(html.includes(`data-help-name="${type}"`), `${type} has no help block`)
  }

  console.log('helix nodes test: ok')
})().catch((err) => {
  console.error('helix nodes test failed:', err && err.message ? err.message : err)
  process.exit(1)
})
