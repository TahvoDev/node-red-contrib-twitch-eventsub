#!/usr/bin/env node
'use strict'

/**
 * Differential test for the EventSub registry.
 *
 * `eventsub-mapping.golden.json` was produced from the hand-written per-node
 * `mapEvent` implementations the registry replaced. This runs the registry-driven
 * `mapEvent` against the same synthetic events and compares the payloads, so a
 * typo or a changed transform in the registry fails the build instead of quietly
 * altering what a flow receives.
 */

const fs = require('fs')
const path = require('path')
const { eventsFor, normalize, VARIANTS } = require('./eventsub-fixtures')

const root = path.resolve(__dirname, '..')
const registryPath = path.join(root, 'dist', 'twitch', 'eventsub', 'eventsub-registry.js')
const nodePath = path.join(root, 'dist', 'twitch', 'eventsub', 'eventsub-node.js')

let EVENTS
let mapEvent
try {
  ({ EVENTS } = require(registryPath))
  ;({ mapEvent } = require(nodePath))
} catch (error) {
  console.error('could not load the compiled registry from dist/. run `npm run build` first.')
  if (error.code === 'MODULE_NOT_FOUND') console.error(`  ${error.message}`)
  process.exit(1)
}

const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'eventsub-mapping.golden.json'), 'utf8'))
const byType = new Map(EVENTS.map((definition) => [definition.type, definition]))

const failures = []
for (const { type, variant, event } of eventsFor([...byType.keys()])) {
  const expected = golden[type] && golden[type][variant]
  if (!expected) {
    failures.push(`${type}/${variant}: no golden entry`)
    continue
  }
  const actual = normalize(mapEvent(byType.get(type), event))
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(`${type}/${variant}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`)
  }
}

for (const type of Object.keys(golden)) {
  if (!byType.has(type)) failures.push(`${type}: in the golden fixtures but not the registry`)
}
for (const type of byType.keys()) {
  if (!(type in golden)) failures.push(`${type}: in the registry but not the golden fixtures`)
}

if (failures.length) {
  console.error(`EventSub mappings differ from the golden fixtures (${failures.length}):`)
  for (const failure of failures) console.error(`  ${failure}`)
  process.exit(1)
}

console.log(`EventSub mappings match the golden fixtures: ${byType.size} events x ${VARIANTS.length} variants`)
