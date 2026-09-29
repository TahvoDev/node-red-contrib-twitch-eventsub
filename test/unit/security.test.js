#!/usr/bin/env node
'use strict'

/**
 * Security unit + integration test.
 *
 * Scope: strings *from Twitch*. The sanitizer cleans Twitch-origin data (chat
 * text, EventSub fields) before a consumer sees it; the builder's own input is
 * passed through (Twurple validates and neutralises what goes back on the wire).
 *
 * Runs the attack corpus and the sanitizer boundaries against the built
 * dist/security output, plus small mock IRC and Helix sinks to prove the
 * pass-through. Any failed assert exits non-zero, failing `npm run test:unit`.
 */

const assert = require('assert')
const path = require('path')

const root = path.join(__dirname, '..', '..')
const security = require(path.join(root, 'dist', 'security', 'index.js'))
const {
  sanitize,
  sanitizeText,
  sanitizeStatus,
  sanitizeLogLine,
  isLogin,
  isUserId,
  escapeHtml,
  redactSecrets,
  validateSchema,
  safeGet,
  safeMerge,
  sanitizeDeep,
  buildUrl,
  markUntrusted,
  computeEventsubSignature,
  verifyEventsubRequest,
  ReplayGuard,
  BoundedBuffer,
  MAX_TEXT_LENGTH,
} = security

/* ----------------------------------------------------------- attack corpus */

// Twitch-origin text: line controls and bidi overrides must not survive.
const ATTACKS = [
  '\r\nPRIVMSG #x :pwn',
  'hi\r\nJOIN #evil',
  '{{{x}}}',
  '{"__proto__":{"a":1}}',
  '\u202Egnp\u202B',
  '../etc/passwd',
  '&scope=admin',
  'a\tb\0c',
  'javascript:alert(1)',
]

for (const attack of ATTACKS) {
  const cleaned = sanitizeText(attack)
  assert.ok(!/[\r\n\0\t]/.test(cleaned), `newline survived: ${JSON.stringify(attack)}`)
  assert.ok(
    !/[\u202A-\u202E\u2066-\u2069]/.test(cleaned),
    `bidi override survived: ${JSON.stringify(attack)}`
  )
}

// Legitimate Unicode is preserved: no NFKC, and zero-width joiners/marks stay.
assert.strictEqual(sanitizeText('Ａ①ﬁ'), 'Ａ①ﬁ')
assert.strictEqual(sanitizeText('👨\u200D👩\u200D👧'), '👨\u200D👩\u200D👧') // ZWJ family emoji
assert.strictEqual(sanitizeText('a\u200Bb\uFEFFc'), 'a\u200Bb\uFEFFc')
assert.strictEqual(sanitizeText('שלום\u200F'), 'שלום\u200F') // RTL + RLM kept
// The bidi override is still removed.
assert.strictEqual(sanitizeText('a\u202Eb'), 'ab')

// 10MB input: capped, and fast (length fast path avoids a 10M-element array).
const huge = 'a'.repeat(10 * 1024 * 1024)
assert.strictEqual(sanitizeText(huge).length, MAX_TEXT_LENGTH)

assert.strictEqual(sanitizeText('abc', 0), '')
assert.strictEqual(isLogin('SomeUser'), true)
assert.strictEqual(isLogin('bad name'), false)
assert.strictEqual(isUserId('12345'), true)
assert.strictEqual(isUserId('&scope=admin'), false)

/* ------------------------------------------------------ prototype pollution */

assert.throws(
  () => validateSchema(JSON.parse('{"__proto__":{"a":1},"name":"x"}'), { fields: { name: { kind: 'string' } } }),
  /forbidden key/
)
assert.throws(
  () => validateSchema({ name: 'x', extra: 1 }, { fields: { name: { kind: 'string' } } }),
  /unknown key/
)
const validated = validateSchema({ name: 'x' }, { fields: { name: { kind: 'string' } } })
assert.deepStrictEqual(Object.keys(validated), ['name'])

assert.strictEqual(safeGet({}, '__proto__'), undefined)
assert.strictEqual(safeGet({ constructor: 1 }, 'constructor'), 1)
assert.strictEqual(safeGet('a string', 'length'), undefined)
assert.strictEqual(safeGet(null, 'x'), undefined)

const mergedTarget = {}
safeMerge(mergedTarget, JSON.parse('{"__proto__":{"polluted":true},"ok":1}'))
assert.strictEqual(Object.prototype.polluted, undefined)
assert.strictEqual(mergedTarget.ok, 1)
assert.strictEqual(safeMerge({ a: 1 }, null).a, 1)

/* ---------------------------------------------------------- schema shapes */

const shapes = validateSchema(
  { name: 'x', count: 3, flag: true, ids: ['a'], nested: { child: 'y' }, def: undefined },
  {
    fields: {
      name: { kind: 'string', maxLength: 10 },
      count: { kind: 'int', min: 0, max: 10 },
      flag: { kind: 'bool' },
      ids: { kind: 'string[]', maxItems: 5, maxLength: 3 },
      nested: { kind: 'object', schema: { fields: { child: { kind: 'string' } } } },
      def: { kind: 'string', default: 'fallback' },
      opt: { kind: 'string', optional: true },
    },
  }
)
assert.strictEqual(shapes.count, 3)
assert.strictEqual(shapes.ids[0], 'a')
assert.strictEqual(shapes.nested.child, 'y')
assert.strictEqual(shapes.def, 'fallback')
assert.strictEqual(shapes.opt, undefined)
assert.throws(() => validateSchema({ count: 'x' }, { fields: { count: { kind: 'int' } } }), /integer/)
assert.throws(() => validateSchema({ flag: 1 }, { fields: { flag: { kind: 'bool' } } }), /boolean/)
assert.throws(() => validateSchema({ ids: ['a', 'b'] }, { fields: { ids: { kind: 'string[]', maxItems: 1 } } }), /too many/)
assert.throws(() => validateSchema({ name: 1 }, { fields: { name: { kind: 'string' } } }), /must be a string/)
assert.throws(() => validateSchema({ name: 'x' }, { fields: { name: { kind: 'string', pattern: /^\d+$/ } } }), /invalid format/)
assert.throws(() => validateSchema({ count: 99 }, { fields: { count: { kind: 'int', max: 10 } } }), /above the maximum/)
assert.throws(() => validateSchema({ count: -1 }, { fields: { count: { kind: 'int', min: 0 } } }), /below the minimum/)
assert.throws(() => validateSchema({ x: 1 }, { fields: { x: { kind: 'bogus' } } }), /Unknown field kind/)
assert.throws(() => validateSchema({ ids: [1] }, { fields: { ids: { kind: 'string[]' } } }), /must be a string/)
// strict: false ignores unknown keys (config may carry Node-RED's own fields).
const nonStrict = validateSchema({ name: 'x', other: 1 }, { strict: false, fields: { name: { kind: 'string' } } })
assert.strictEqual(nonStrict.name, 'x')
assert.strictEqual(nonStrict.other, undefined)

/* ---------------------------------------------------------- sanitizeDeep */

const deep = sanitizeDeep(
  JSON.parse('{"text":"a\\r\\nb","__proto__":{"x":1},"count":2,"list":["/x","ok"]}')
)
assert.strictEqual(deep.text, 'a b')
assert.strictEqual(deep.count, 2)
assert.deepStrictEqual(deep.list, ['/x', 'ok'])
assert.ok(!Object.prototype.hasOwnProperty.call(deep, '__proto__') || deep.__proto__ === undefined)

// Past the depth limit an object is dropped, not returned raw.
assert.deepStrictEqual(sanitizeDeep(['x'], 5, 99), [])
assert.deepStrictEqual(sanitizeDeep({ deep: { a: 1 } }, 5, 99), {})
let deepAttack = '\u202E\r\nJOIN #evil'
for (let i = 0; i < 16; i++) deepAttack = { child: deepAttack }
assert.strictEqual(JSON.stringify(sanitizeDeep(deepAttack)).indexOf('JOIN'), -1, 'deep payload bypassed the depth cap')

/* --------------------------------------------------------------- outputs */

assert.strictEqual(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;')
assert.strictEqual(escapeHtml('a"b\'c&d'), 'a&quot;b&#39;c&amp;d')
assert.strictEqual(sanitize('{"x":1}', 'html'), '{&quot;x&quot;:1}')
assert.strictEqual(sanitize('a\r\nb', 'text'), 'a b')
assert.strictEqual(sanitize('a\r\nb', 'topic'), 'a b')
assert.strictEqual(sanitize('a\r\nb', 'log'), 'a b')
assert.strictEqual(sanitize('x', 'status'), 'x')
assert.strictEqual(sanitizeStatus('x'), 'x')
assert.throws(() => sanitize('x', 'nope'), /Unknown sanitize policy/)

const redacted = redactSecrets('Authorization: Bearer abcdefghijklmnop oauth:1234567890 client_secret=supersecret')
assert.ok(!/abcdefghijklmnop/.test(redacted), 'bearer token leaked')
assert.ok(!/1234567890/.test(redacted), 'oauth token leaked')
assert.ok(!/supersecret/.test(redacted), 'secret leaked')

assert.ok(sanitizeStatus('a'.repeat(100)).length <= 40)
assert.ok(!/[\r\n]/.test(sanitizeLogLine('line1\r\nline2')))

/* ---------------------------------------------------------------- URL policy */

assert.strictEqual(
  buildUrl('https://id.twitch.tv', '/oauth2/device', { client_id: 'abc' }).toString(),
  'https://id.twitch.tv/oauth2/device?client_id=abc'
)
assert.throws(() => buildUrl('https://evil.example', '/x', {}), /Blocked URL host/)
assert.throws(
  () => buildUrl('https://id.twitch.tv', '/oauth2/token', {}, { pathPrefixes: ['/oauth2/device'] }),
  /Blocked URL path/
)
assert.throws(
  () => buildUrl('https://id.twitch.tv', '/x', JSON.parse('{"__proto__":"y"}')),
  /Blocked URL parameter/
)

/* ----------------------------------------------------------------- webhooks */

const SECRET = 'mock-client-secret'
const body = Buffer.from('{"subscription":{"type":"channel.follow"}}')
const messageId = 'msg-123'
const timestamp = new Date().toISOString()
const goodSignature = computeEventsubSignature(messageId, timestamp, body, SECRET)
const headers = {
  'twitch-eventsub-message-id': messageId,
  'twitch-eventsub-message-timestamp': timestamp,
  'twitch-eventsub-message-signature': goodSignature,
}
assert.strictEqual(verifyEventsubRequest({ secret: SECRET, rawBody: body, headers }).ok, true)

// Forged signature.
const forged = { ...headers, 'twitch-eventsub-message-signature': 'sha256=deadbeef' }
assert.deepStrictEqual(verifyEventsubRequest({ secret: SECRET, rawBody: body, headers: forged }), {
  ok: false,
  reason: 'bad-signature',
})

// Body tampered after signing.
assert.strictEqual(verifyEventsubRequest({ secret: SECRET, rawBody: Buffer.from('{"x":1}'), headers }).ok, false)

// Stale timestamp.
const old = new Date(Date.now() - 11 * 60 * 1000).toISOString()
const oldHeaders = {
  ...headers,
  'twitch-eventsub-message-timestamp': old,
  'twitch-eventsub-message-signature': computeEventsubSignature(messageId, old, body, SECRET),
}
assert.deepStrictEqual(verifyEventsubRequest({ secret: SECRET, rawBody: body, headers: oldHeaders }), {
  ok: false,
  reason: 'stale-timestamp',
})

assert.strictEqual(verifyEventsubRequest({ secret: SECRET, rawBody: body, headers: {} }).reason, 'missing-headers')
assert.strictEqual(
  verifyEventsubRequest({ secret: SECRET, rawBody: body.toString('utf8'), headers: { ...headers, 'twitch-eventsub-message-id': [messageId, 'x'] } }).ok,
  true
)

const guard = new ReplayGuard()
assert.strictEqual(guard.check('id-1'), true)
assert.strictEqual(guard.check('id-1'), false)
assert.strictEqual(guard.check('id-2'), true)
const expiring = new ReplayGuard(1000)
assert.strictEqual(expiring.check('id-a', 1000), true)
assert.strictEqual(expiring.check('id-a', 3000), true, 'expired id was not pruned')
const capped = new ReplayGuard(1000, 1)
assert.strictEqual(capped.check('first', 0), true)
assert.strictEqual(capped.check('second', 0), true)
assert.strictEqual(capped.check('first', 0), true, 'oldest entry was not evicted')

/* --------------------------------------------------------- inbound buffers */

const buffer = new BoundedBuffer(5)
buffer.append('abcdefgh')
assert.strictEqual(buffer.length, 5)
assert.strictEqual(buffer.toString(), 'defgh')
buffer.clear()
assert.strictEqual(buffer.length, 0)

/* --------------------------------------------------------- trusted envelope */

const envelopeMsg = {}
const envelope = markUntrusted(envelopeMsg, 'chat', { text: 'raw' })
assert.strictEqual(envelope.untrusted, true)
assert.strictEqual(envelopeMsg.twitch.untrusted, true)
assert.deepStrictEqual(envelopeMsg.twitch.raw, { text: 'raw' })
assert.strictEqual(envelopeMsg.twitch.source, 'chat')

/* ------------------------------------------------------------ property tests */

// The sanitizer output must never contain a forbidden character and never exceed
// the cap, for any input drawn from a hostile alphabet.
const FORBIDDEN = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069\r\n\t\0]/
const ALPHABET = ['a', 'Z', '0', ' ', '\r', '\n', '\t', '\0', '\u202E', '\u202B', '\u200B', '\uFEFF', '&', '<', '>', '"', "'", '/', '.', '#', '\u{1F600}']
let seed = 12345
function random() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}
for (let i = 0; i < 3000; i++) {
  let input = ''
  const len = Math.floor(random() * 40)
  for (let j = 0; j < len; j++) input += ALPHABET[Math.floor(random() * ALPHABET.length)]
  const max = 1 + Math.floor(random() * 200)
  const out = sanitizeText(input, max)
  assert.ok(!FORBIDDEN.test(out), `forbidden char from ${JSON.stringify(input)} -> ${JSON.stringify(out)}`)
  assert.ok(Array.from(out).length <= max, `over cap from ${JSON.stringify(input)}`)
}

/* ------------------------------------------------- integration: mock sinks */

function makeNode() {
  const node = { errors: [], statuses: [] }
  node.error = (e) => node.errors.push(e)
  node.status = (s) => node.statuses.push(s)
  return node
}

;(async () => {
  const base = require(path.join(root, 'dist', 'twitch', 'chat', 'twitch-chat-base.js'))

  // Mock IRC server: the builder's own text is handed to Twurple unchanged;
  // Twurple strips CR/LF at the wire, not this node.
  const sent = []
  const connection = {
    initChat: async () => ({ say: async (channel, text, opts) => sent.push({ channel, text, opts }) }),
  }
  const node = makeNode()
  const builderText = '/ban victim\r\nPRIVMSG #x :pwn'
  await base.sendChatMessage(node, connection, { channel: 'somechannel' }, { payload: builderText }, () => {})
  assert.strictEqual(sent.length, 1)
  assert.strictEqual(sent[0].channel, 'somechannel')
  assert.strictEqual(sent[0].text, builderText)

  // An empty channel still fails loudly before any send.
  const badNode = makeNode()
  await base.sendChatMessage(badNode, connection, {}, { payload: 'hi', channel: '' }, () => {})
  assert.strictEqual(sent.length, 1, 'send happened without a channel')
  assert.match(String(badNode.errors[0]), /No channel specified/)

  // Mock Helix sink through the real dispatcher: builder input passes through.
  const { callEndpoint } = require(path.join(root, 'dist', 'twitch', 'helix', 'helix-core.js'))
  const { defineHelix } = require(path.join(root, 'dist', 'twitch', 'helix', 'define.js'))
  let received
  const api = { asUser: async (_id, fn) => fn({}) }
  const spec = defineHelix({
    type: 'twitch-helix-security-test',
    tier: 'core',
    label: 'security test',
    help: 'test',
    scopes: [],
    fields: [{ name: 'text', label: 'Text', kind: 'string' }],
    context: 'app',
    run: async ({ input }) => {
      received = input.text
      return { input }
    },
  })
  const builderField = 'ok\r\nJOIN #evil\u202E'
  await callEndpoint(spec, api, { text: builderField }, {}, { userId: '1', config: { twitch_user_id: '1' } })
  assert.strictEqual(received, builderField, 'builder Helix input was rewritten')

  console.log('security test: ok')
})().catch((err) => {
  console.error('security test failed:', err && err.message ? err.message : err)
  process.exit(1)
})
