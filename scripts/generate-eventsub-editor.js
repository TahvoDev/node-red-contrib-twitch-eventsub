#!/usr/bin/env node
'use strict'

/**
 * Inlines the EventSub registry into the twitch-eventsub editor so the Event
 * dropdown is built synchronously from data the editor already has.
 *
 * The alternative — serving the catalog over an admin route and fetching it with
 * $.getJSON — cost a runtime dependency on the config node, an empty dropdown on
 * failure, a race where deploying before the fetch saved an empty event, and a
 * shadow `eventLabel` field to carry the friendly name. None of that is needed
 * for data that is fixed at build time.
 *
 * Replaces the `__EVENT_CATALOG__` token in `src/.../twitch-eventsub.html`; if the
 * token is gone the generated script would be a syntax error, so fail the build
 * instead.
 */

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const registryPath = path.join(root, 'dist', 'twitch', 'eventsub', 'eventsub-registry.js')
const templatePath = path.join(root, 'src', 'twitch', 'eventsub', 'twitch-eventsub.html')
const outPath = path.join(root, 'dist', 'twitch', 'eventsub', 'twitch-eventsub.html')

const TOKEN = '__EVENT_CATALOG__'

const { EVENTS, fieldKey } = require(registryPath)

const catalog = EVENTS.map((event) => ({
  type: event.type,
  label: event.label,
  category: event.category,
  description: event.description,
  fields: event.fields.map(fieldKey),
}))

const template = fs.readFileSync(templatePath, 'utf8')
if (!template.includes(TOKEN)) {
  console.error(`twitch-eventsub.html is missing the ${TOKEN} placeholder`)
  process.exit(1)
}

// JSON.stringify then neutralise "<" so a value can never close the <script>.
const json = JSON.stringify(catalog).replace(/</g, '\\u003c')

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, template.replace(TOKEN, json))
console.log(`inlined ${catalog.length} EventSub events into the editor`)
