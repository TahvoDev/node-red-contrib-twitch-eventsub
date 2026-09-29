#!/usr/bin/env node
'use strict'

/**
 * Chat nodes test.
 *
 * Asserts the message-property rules and helper behaviour the chat nodes rely
 * on, so a change to one node cannot quietly break the node it is wired to.
 * There is no test framework: it runs against the built dist/ output, and any
 * failed assert throws and exits non-zero, failing `npm run test:unit`,
 * `npm run check` and `npm run build`.
 */

const assert = require('assert')
const path = require('path')

const base = require(path.join(__dirname, '..', '..', 'dist', 'twitch', 'chat', 'twitch-chat-base.js'))
const {
  buildCommandTrigger,
  clampTimeoutDuration,
  matchCommand,
  messageText,
  normalizeChannel,
  parseChannels,
  resolveAnnounceColor,
  resolveUserId,
  MAX_TIMEOUT_SECONDS,
} = base

// twitch-chat-in emits the sender's chat colour as msg.color; it is a hex value,
// not one of Twitch's announcement colours, and must not fail the announcement.
assert.strictEqual(resolveAnnounceColor({ color: '#FF0000' }), 'primary')
assert.strictEqual(resolveAnnounceColor({}), 'primary')
assert.strictEqual(resolveAnnounceColor({ color: 'blu' }), 'primary')
assert.strictEqual(resolveAnnounceColor({ color: 'blue' }), 'blue')
assert.strictEqual(resolveAnnounceColor({ announceColor: 'purple' }), 'purple')
assert.strictEqual(resolveAnnounceColor({ color: '#FF0000', announceColor: 'green' }), 'green')

// Channel names arrive as '#Name', ' name ' or as a number, from config or msg.
assert.strictEqual(normalizeChannel('#SomeChannel'), 'somechannel')
assert.strictEqual(normalizeChannel('  other  '), 'other')
assert.strictEqual(normalizeChannel(undefined), '')
// Must never be confused with an Object.prototype key by a cache lookup.
assert.strictEqual(normalizeChannel('__proto__'), '__proto__')

// The config channel list is comma-separated, with or without '#' and spaces.
assert.deepStrictEqual(parseChannels('Channel1, #channel2 ,, channel3'), [
  'channel1',
  'channel2',
  'channel3',
])
assert.deepStrictEqual(parseChannels(''), [])
assert.deepStrictEqual(parseChannels(undefined), [])
assert.deepStrictEqual(parseChannels('__proto__'), ['__proto__'])

// Only string payloads/text are sent; a non-string is not coerced to
// "[object Object]" on its way to chat.
assert.strictEqual(messageText({ payload: 'hi' }), 'hi')
assert.strictEqual(messageText({ text: 'hi' }), 'hi')
assert.strictEqual(messageText({ payload: { a: 1 }, text: 'fallback' }), 'fallback')
assert.strictEqual(messageText({ payload: 42 }), '')
assert.strictEqual(messageText({ payload: null, text: 'x' }), 'x')
assert.strictEqual(messageText({}), '')

// Timeout duration is clamped to Twitch's two-week cap.
assert.strictEqual(clampTimeoutDuration(30), 30)
assert.strictEqual(clampTimeoutDuration('30'), 30)
assert.strictEqual(clampTimeoutDuration(1e15), MAX_TIMEOUT_SECONDS)
assert.throws(() => clampTimeoutDuration(0), /duration/)
assert.throws(() => clampTimeoutDuration(-5), /duration/)
assert.throws(() => clampTimeoutDuration('nope'), /duration/)

// Command trigger: an unconfigured command is rejected, not treated as "!".
assert.deepStrictEqual(buildCommandTrigger('!', 'hello'), { name: 'hello', trigger: '!hello' })
assert.deepStrictEqual(buildCommandTrigger('', 'hello'), { name: 'hello', trigger: '!hello' })
assert.throws(() => buildCommandTrigger('!', ''), /requires a command name/)
assert.throws(() => buildCommandTrigger('!', '   '), /requires a command name/)

// Command matching uses a token boundary, not a regex word boundary: the trigger
// must be followed by whitespace or the end of the string. Case is ignored for
// the match, while the arguments keep their original case.
assert.deepStrictEqual(matchCommand('!hello world', '!hello'), ['world'])
assert.deepStrictEqual(matchCommand('!HELLO', '!hello'), [])
assert.deepStrictEqual(matchCommand('!BAN Victim', '!ban'), ['Victim'])
assert.deepStrictEqual(matchCommand('!ban two  words', '!ban'), ['two', 'words'])
assert.deepStrictEqual(matchCommand('!ban\tvictim', '!ban'), ['victim'])
assert.deepStrictEqual(matchCommand('!ban   ', '!ban'), [])
assert.deepStrictEqual(matchCommand('!ban', '!ban'), [])
// Anything glued to the command is a different token, so it does not match.
for (const glued of [
  '!banned',
  '!banana',
  '!ban.',
  '!ban!',
  '!ban,victim',
  '!ban-victim',
  '!ban_victim',
  '!ban@victim',
]) {
  assert.strictEqual(matchCommand(glued, '!ban'), undefined, glued)
}
// The match is anchored at the start of the message.
assert.strictEqual(matchCommand('x!ban', '!ban'), undefined)
assert.strictEqual(matchCommand('hello', '!hello'), undefined)
assert.strictEqual(matchCommand('', '!hello'), undefined)

;(async () => {
  const lookup = { users: { getUserByName: async (name) => ({ id: `looked-up-${name}` }) } }

  // An explicit id is used as-is and never looked up.
  assert.strictEqual(await resolveUserId(lookup, { targetUserId: '12345' }), '12345')
  assert.strictEqual(await resolveUserId(lookup, { targetUserId: '12345', targetUser: 'ignored' }), '12345')

  // A numeric login must be resolved as a LOGIN, not mistaken for a user id.
  assert.strictEqual(await resolveUserId(lookup, { targetUser: '12345' }), 'looked-up-12345')

  // There is no msg.user fallback: a missing target fails loudly.
  await assert.rejects(() => resolveUserId(lookup, { user: 'sender' }), /Target user is required/)
  await assert.rejects(() => resolveUserId(lookup, {}), /Target user is required/)
  await assert.rejects(() => resolveUserId(lookup, { targetUser: 'bad name!' }), /must be a Twitch login/)
  await assert.rejects(() => resolveUserId(lookup, { targetUserId: 'not-a-number' }), /must be a numeric/)
  await assert.rejects(
    () => resolveUserId({ users: { getUserByName: async () => null } }, { targetUser: 'ghost' }),
    /could not be found/
  )

  // A chat connection whose account auth throws must surface a red status on its
  // listener nodes instead of leaving them stuck on "Connecting..." forever.
  let ConnectionCtor
  const RED = {
    nodes: {
      createNode(created) {
        created.status = () => {}
        created.error = () => {}
        created.on = () => {}
      },
      getNode: () => ({
        initAuth: async () => { throw new Error('invalid refresh token') },
        getAuthProvider: () => undefined,
      }),
      registerType: (_type, ctor) => { ConnectionCtor = ctor },
    },
  }
  require(path.join(__dirname, '..', '..', 'dist', 'twitch', 'chat', 'twitch-chat-connection.js'))(RED)

  const connection = new ConnectionCtor({ id: 'conn', account: 'acct', channels: '' })
  let status
  connection.addListener('n1', { id: 'n1', status: (s) => { status = s }, error() {}, on() {} })
  await new Promise((resolve) => setImmediate(resolve))
  assert.strictEqual(status.fill, 'red')
  assert.match(status.text, /Auth failed: invalid refresh token/)

  // Role verification is server-side: the flags on the message are ignored.
  const roleApi = {
    users: { getUserByName: async () => ({ id: '55' }) },
    asUser: async (_id, fn) => fn({
      moderation: { checkUserIsModerator: async () => true },
      subscriptions: { checkUserSubscription: async () => ({ tier: '1000' }) },
      channels: { getVips: async () => [{ id: '99' }] },
    }),
  }
  const roleConnection = {
    initChat: async () => ({}),
    getApiClient: () => roleApi,
    getUserId: () => '55',
    addListener() {}, removeListener() {},
  }
  assert.strictEqual(await base.verifyChatRole(roleConnection, {}, {}), true)
  assert.strictEqual(await base.verifyChatRole(roleConnection, { requireBroadcaster: true, channel: 'chan' }, { userId: '55' }), true)
  assert.strictEqual(await base.verifyChatRole(roleConnection, { requireBroadcaster: true, channel: 'chan' }, { userId: '99' }), false)
  assert.strictEqual(await base.verifyChatRole(roleConnection, { requireMod: true, channel: 'chan' }, { userId: '99' }), true)
  assert.strictEqual(await base.verifyChatRole(roleConnection, { requireVip: true, channel: 'chan' }, { userId: '99' }), true)
  assert.strictEqual(await base.verifyChatRole(roleConnection, { requireSub: true, channel: 'chan' }, { userId: '99' }), true)
  // Fail closed: no connection, missing/invalid sender, or API error denies.
  assert.strictEqual(await base.verifyChatRole(undefined, { requireMod: true, channel: 'chan' }, { userId: '99' }), false)
  assert.strictEqual(await base.verifyChatRole(roleConnection, { requireMod: true, channel: 'chan' }, { userId: 'not-an-id' }), false)
  const failing = { ...roleConnection, getApiClient: () => ({ users: { getUserByName: async () => { throw new Error('down') } } }) }
  assert.strictEqual(await base.verifyChatRole(failing, { requireMod: true, channel: 'chan' }, { userId: '99' }), false)

  console.log('chat nodes test: ok')
})().catch((err) => {
  console.error('chat nodes test failed:', err.message)
  process.exit(1)
})
