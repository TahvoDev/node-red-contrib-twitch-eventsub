#!/usr/bin/env node
'use strict'

/**
 * Plain-output audit.
 *
 * Every value the Twitch nodes put on a message must be plain data: plain or
 * null-prototype objects, arrays, Dates, Buffers and typed arrays — never a
 * Twurple DataObject (whose data hides behind a symbol and never serialises) and
 * never a class instance that could smuggle an unnormalised string past
 * `sanitizeInbound`. This test is the CI-visible guard for three boundaries:
 *
 *   1. the EventSub registry: every plain-string field that maps to a
 *      DataObject-returning getter must have an explicit `map` that flattens it;
 *   2. the EventSub mapper at runtime, on a real Twurple event with a hostile
 *      payload;
 *   3. the chat-in message builder.
 *
 * Runs against the built dist/ output. Any failed assert throws and exits
 * non-zero, failing `npm run test:unit`, `npm run check` and `npm run build`.
 */

const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..', '..')
const eventsubDist = path.join(root, 'dist', 'twitch', 'eventsub')
const { EVENTS } = require(path.join(eventsubDist, 'eventsub-registry.js'))
const { mapEvent } = require(path.join(eventsubDist, 'eventsub-mapper.js'))
const { sanitizeInbound } = require(path.join(root, 'dist', 'twitch', 'twitch-shared.js'))
const { buildChatMessage } = require(path.join(root, 'dist', 'twitch', 'chat', 'twitch-chat-in.js'))
const { HELIX_SPECS } = require(path.join(root, 'dist', 'twitch', 'helix', 'specs', 'index.js'))

/* ------------------------------------------------------- plain-output check */

function isPlainObject(value) {
  const proto = Object.getPrototypeOf(value)
  return proto === null || proto === Object.prototype
}

/** Throws when `value` contains anything other than plain data. `where` labels the path. */
function assertPlainOutput(value, where) {
  const label = where || 'value'
  if (value === null || value === undefined) return
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return
  if (value instanceof Date || Buffer.isBuffer(value) || ArrayBuffer.isView(value)) return
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPlainOutput(item, `${label}[${index}]`))
    return
  }
  assert.strictEqual(typeof value, 'object', `${label}: function/symbol leaked`)
  assert.ok(isPlainObject(value), `${label}: ${value.constructor && value.constructor.name} is not a plain object`)
  for (const key of Object.keys(value)) assertPlainOutput(value[key], `${label}.${key}`)
}

/* ------------------------------------------------- EventSub registry lint */

// DataObject classes and their getters, straight from Twurple's type
// declarations, so a new event field that returns a DataObject is caught even
// though there is no fixture for it.
function readDataObjectGetters(base) {
  const classExtends = {}
  const gettersByClass = {}
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (!entry.name.endsWith('.d.ts')) continue
      let current = null
      for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
        const decl = line.match(/export declare class (\w+)(?:<[^>]*>)? extends ([\w.<>]+)/)
        if (decl) {
          current = decl[1]
          classExtends[current] = decl[2].replace(/<.*$/, '')
          gettersByClass[current] = gettersByClass[current] || []
          continue
        }
        const getter = line.match(/^\s*get (\w+)\(\)\s*:\s*([^;]+);/)
        if (getter && current) gettersByClass[current].push({ name: getter[1], type: getter[2].trim() })
      }
    }
  }
  walk(base)

  const isDataObject = (name, seen) => {
    const visited = seen || new Set()
    if (!name || visited.has(name)) return false
    visited.add(name)
    if (name === 'DataObject') return true
    return classExtends[name] ? isDataObject(classExtends[name], visited) : false
  }
  const dataObjectClasses = new Set(Object.keys(classExtends).filter((name) => isDataObject(name)))

  const returnsDataObject = (type) =>
    type
      .replace(/\[\]/g, ' ')
      .split(/[|\s&<>(),]+/)
      .filter(Boolean)
      .some((token) => dataObjectClasses.has(token))

  // listener method -> event class, from EventSubBase.d.ts.
  const baseTypes = fs.readFileSync(path.join(base, 'EventSubBase.d.ts'), 'utf8')
  const methodToClass = {}
  for (const match of baseTypes.matchAll(/on(\w+)\([^)]*handler:\s*\([^)]*:\s*(\w+Event)\)/g)) {
    methodToClass['on' + match[1]] = match[2]
  }

  const badGettersFor = (eventClass) =>
    (gettersByClass[eventClass] || []).filter((getter) => returnsDataObject(getter.type)).map((getter) => getter.name)

  return { badGettersFor, methodToClass }
}

const twurpleBase = path.join(root, 'node_modules', '@twurple', 'eventsub-base', 'lib')
const { badGettersFor, methodToClass } = readDataObjectGetters(twurpleBase)

let linted = 0
for (const definition of EVENTS) {
  const subscribeSource = String(definition.subscribe)
  const method = (subscribeSource.match(/listener\.(\w+)/) || [])[1]
  const eventClass = method && methodToClass[method]
  if (!eventClass) continue
  linted++
  const bad = new Set(badGettersFor(eventClass))
  for (const field of definition.fields) {
    if (typeof field !== 'string') continue
    assert.ok(
      !bad.has(field),
      `${definition.type}: field "${field}" returns a DataObject (${eventClass}.${field}) but has no map`
    )
  }
}
assert.ok(linted > 40, `registry lint resolved too few events (${linted}); is the Twurple layout still parsed?`)

/* ----------------------------------------------- EventSub runtime (real) */

const { EventSubAutoModMessageHoldV2Event } = require('@twurple/eventsub-base')

const hostileText = 'hello \u2028 FREE\nSUB \u001b[31m'
const hold = new EventSubAutoModMessageHoldV2Event(
  {
    broadcaster_user_id: '100',
    broadcaster_user_login: 'caster',
    broadcaster_user_name: 'Caster',
    user_id: '200',
    user_login: 'viewer',
    user_name: 'V\u200Biewer',
    message_id: 'msg-1',
    message: { text: hostileText },
    reason: 'blocked_term',
    automod: { category: 'hostile', level: 3, boundaries: [{ start_pos: 6, end_pos: 10 }] },
    blocked_term: {
      terms_found: [
        {
          term_id: 'term-1',
          boundary: { start_pos: 6, end_pos: 9 },
          owner_broadcaster_user_id: '100',
          owner_broadcaster_user_login: 'caster',
          owner_broadcaster_user_name: 'C\u200Baster',
        },
      ],
    },
    held_at: '2024-01-01T00:00:00Z',
  },
  null
)

const holdDefinition = EVENTS.find((event) => event.type === 'twitch-eventsub-automod-message-hold')
const holdPayload = mapEvent(holdDefinition, hold)
assertPlainOutput(holdPayload, 'automod hold')

assert.strictEqual(holdPayload.userDisplayName, 'Viewer', 'zero-width space not stripped from display name')
assert.ok(!/[\r\n\u2028\u001b]/.test(holdPayload.messageText), 'control char survived in messageText')
assert.strictEqual(typeof holdPayload.autoMod, 'object', 'autoMod not flattened')
assertPlainOutput(holdPayload.autoMod, 'autoMod')
assert.strictEqual(holdPayload.autoMod.category, 'hostile')
assert.ok(Array.isArray(holdPayload.blockedTerms), 'blockedTerms not flattened to an array')
assertPlainOutput(holdPayload.blockedTerms, 'blockedTerms')
assert.ok(!/[\u2028]/.test(holdPayload.blockedTerms[0].text), 'blockedTerm text not sanitized')
assert.strictEqual(holdPayload.blockedTerms[0].ownerBroadcasterDisplayName, 'Caster')
// rawEvent is the untouched original, newline and all.
assert.ok(holdPayload.rawEvent.message.text.includes('\u2028'), 'rawEvent was altered')

/* -------------------------------------------------------------- chat-in */

const chatMessage = {
  id: 'chat-1',
  bits: 0,
  isCheer: false,
  emoteOffsets: new Map([['Kappa', ['0-4']]]),
  userInfo: {
    userName: 'viewer',
    displayName: 'V\u200Biewer',
    userId: '200',
    isMod: false,
    isSubscriber: true,
    isVip: false,
    isBroadcaster: false,
    color: '#FF0000',
    badges: new Map([['subscriber', '12']]),
  },
}
const chatOutput = sanitizeInbound(buildChatMessage('caster', 'hi\r\nPRIVMSG #caster :free sub', chatMessage))
assertPlainOutput(chatOutput, 'chat message')
assert.strictEqual(chatOutput._raw, undefined, 'chat-in still emits _raw')
assert.strictEqual(chatOutput.displayName, 'Viewer')
assert.strictEqual(chatOutput.text, 'hi PRIVMSG #caster :free sub')
assert.strictEqual(chatOutput.isSubscriber, true)
assert.strictEqual(chatOutput.isMod, false)
assert.strictEqual(chatOutput.user, 'viewer')
assert.deepStrictEqual(chatOutput.emotes, [{ name: 'Kappa', positions: ['0-4'] }])
assert.deepStrictEqual(chatOutput.badges, [{ name: 'subscriber', version: '12' }])

/* ----------------------------------------------------------------- Helix */

// Every paged endpoint must declare a map: without one each page item would be
// a raw Twurple DataObject, which the single sanitizeInbound pass cannot flatten.
for (const spec of HELIX_SPECS) {
  for (const [name, action] of Object.entries(spec.actions || {})) {
    if (!(action.paged || spec.paged)) continue
    assert.ok(action.map || spec.map, `${spec.type}.${name}: paged but no map`)
  }
  if (spec.paged) assert.ok(spec.map, `${spec.type}: paged but no map`)
}

console.log(`plain-output test: ok (${EVENTS.length} events, ${linted} linted)`)
