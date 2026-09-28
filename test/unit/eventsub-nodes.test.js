#!/usr/bin/env node
'use strict'

/**
 * EventSub node test.
 *
 * The 72 EventSub events share one node and one mapper, so this checks the two
 * things that used to be spread across 72 generated nodes: the registry is well
 * formed (unique types, every event subscribable) and the field mapper honours
 * the string / from / default / map forms. Runs against the built dist/ output;
 * any failed assert throws and exits non-zero, failing `npm run test:unit`,
 * `npm run check` and `npm run build`.
 */

const assert = require('assert')
const path = require('path')

const eventsubDist = path.join(__dirname, '..', '..', 'dist', 'twitch', 'eventsub')
const { EVENTS, EVENTS_BY_TYPE, fieldKey } = require(path.join(eventsubDist, 'eventsub-registry.js'))
const { mapEvent } = require(path.join(eventsubDist, 'eventsub-mapper.js'))

/* ------------------------------------------------------------- registry */

assert.ok(EVENTS.length > 0, 'registry is empty')

const seen = new Set()
for (const definition of EVENTS) {
  assert.match(definition.type, /^twitch-eventsub-[a-z0-9-]+$/, `bad type: ${definition.type}`)
  assert.ok(!seen.has(definition.type), `duplicate type: ${definition.type}`)
  seen.add(definition.type)
  assert.strictEqual(typeof definition.label, 'string', `no label: ${definition.type}`)
  assert.ok(definition.label.length > 0, `empty label: ${definition.type}`)
  assert.strictEqual(typeof definition.description, 'string', `no description: ${definition.type}`)
  assert.strictEqual(typeof definition.category, 'string', `no category: ${definition.type}`)
  assert.strictEqual(typeof definition.subscribe, 'function', `no subscribe: ${definition.type}`)
  assert.ok(Array.isArray(definition.fields) && definition.fields.length > 0, `no fields: ${definition.type}`)
}

assert.strictEqual(Object.keys(EVENTS_BY_TYPE).length, EVENTS.length)
assert.strictEqual(EVENTS_BY_TYPE['twitch-eventsub-channel-follow'].label, 'follow')
assert.strictEqual(EVENTS_BY_TYPE['twitch-eventsub-does-not-exist'], undefined)

/* --------------------------------------------------------------- fields */

assert.strictEqual(fieldKey('userId'), 'userId')
assert.strictEqual(fieldKey({ key: 'rawEvent', map: () => 1 }), 'rawEvent')

/* ----------------------------------------------------------- mapEvent */

const definition = {
  fields: [
    'straight',
    { key: 'renamed', from: 'source' },
    { key: 'filled', default: 'fallback' },
    { key: 'falsy', default: 'was-falsy', defaultOn: 'falsy' },
    { key: 'derived', map: (event) => `${event.straight}!` },
  ],
}

assert.deepStrictEqual(mapEvent(definition, { straight: 'a', source: 'b' }), {
  straight: 'a',
  renamed: 'b',
  filled: 'fallback',
  falsy: 'was-falsy',
  derived: 'a!',
})

// A present value wins; a nullish one is not replaced unless a default exists.
assert.deepStrictEqual(
  mapEvent(
    { fields: [{ key: 'filled', default: 'fallback' }, { key: 'missing' }] },
    { filled: 'present' }
  ),
  { filled: 'present', missing: undefined }
)

// defaultOn: 'falsy' mirrors `||`, so 0 and '' are replaced too.
assert.deepStrictEqual(
  mapEvent({ fields: [{ key: 'n', default: 5, defaultOn: 'falsy' }] }, { n: 0 }),
  { n: 5 }
)

console.log(`eventsub nodes ok: ${EVENTS.length} events`)
