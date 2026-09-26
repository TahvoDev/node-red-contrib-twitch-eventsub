#!/usr/bin/env node
'use strict'

/**
 * Keeps the "node-red"."nodes" map in package.json in sync with the registry.
 *
 * Every EventSub event must have exactly one entry pointing at its generated module,
 * and no entry may point at a file that no longer exists. Running without --write
 * validates and exits non-zero on drift, which is what the build uses. Running with
 * --write regenerates the map after adding or removing an event.
 */

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const pkgPath = path.join(root, 'package.json')
const registryPath = path.join(root, 'dist', 'twitch', 'eventsub', 'eventsub-registry.js')

let EVENTS
try {
  ({ EVENTS } = require(registryPath))
} catch (error) {
  console.error('could not load the compiled EventSub registry from dist/. run `npm run build` first.')
  if (error.code === 'MODULE_NOT_FOUND') console.error(`  ${error.message}`)
  process.exit(1)
}

assertUniqueTypes(EVENTS)

function assertUniqueTypes(definitions) {
  const counts = new Map()
  for (const definition of definitions) {
    counts.set(definition.type, (counts.get(definition.type) ?? 0) + 1)
  }
  const duplicates = [...counts].filter(([, count]) => count > 1).map(([type]) => type)
  if (duplicates.length) {
    console.error('the EventSub registry contains duplicate node types:')
    for (const type of duplicates) console.error(`  ${type}`)
    process.exit(1)
  }
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
const current = pkg['node-red'].nodes
const write = process.argv.includes('--write')

const GENERATED_DIR = 'dist/twitch/eventsub/generated/'
// Generated EventSub nodes are recognised by where their module lives, not by a
// name prefix, so a future hand-written node that happens to start with
// "twitch-eventsub-" is preserved rather than silently dropped.
const isGeneratedEntry = (file) => typeof file === 'string' && file.startsWith(GENERATED_DIR)

const expectedEvents = {}
for (const definition of EVENTS) {
  expectedEvents[definition.type] = `${GENERATED_DIR}${definition.type}.js`
}

const merged = {}
for (const [type, file] of Object.entries(current)) {
  if (isGeneratedEntry(file)) continue
  merged[type] = file
}
Object.assign(merged, expectedEvents)

const sorted = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)))

if (write) {
  pkg['node-red'].nodes = sorted
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  console.log(`package.json nodes manifest updated (${EVENTS.length} EventSub events)`)
  process.exit(0)
}

const problems = []
for (const [type, file] of Object.entries(expectedEvents)) {
  if (current[type] !== file) problems.push(`missing or wrong entry: ${type} -> ${file}`)
}
for (const [type, file] of Object.entries(current)) {
  if (isGeneratedEntry(file) && !expectedEvents[type]) {
    problems.push(`stale entry not in the registry: ${type}`)
  }
}

if (problems.length) {
  console.error('package.json node-red.nodes is out of sync with the EventSub registry:')
  for (const problem of problems) console.error(`  ${problem}`)
  console.error('\nrun `npm run sync` to regenerate it')
  process.exit(1)
}

console.log(`nodes manifest matches registry: ${EVENTS.length} EventSub events`)
