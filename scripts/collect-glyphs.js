#!/usr/bin/env node
'use strict'

/**
 * Vendors the Bootstrap Icons (MIT) glyphs referenced by
 * `src/twitch/eventsub/eventsub-icons.ts` into `src/icons/glyphs.json`, so a
 * normal build does not need bootstrap-icons installed.
 *
 * Only needed when the glyph mapping changes:
 *   npm i --no-save bootstrap-icons
 *   npx tsc
 *   node scripts/collect-glyphs.js
 */

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const iconsDir = path.join(root, 'node_modules', 'bootstrap-icons', 'icons')
const iconsPkg = path.join(root, 'node_modules', 'bootstrap-icons', 'package.json')
const mappingPath = path.join(root, 'dist', 'twitch', 'eventsub', 'eventsub-icons.js')

if (!fs.existsSync(iconsPkg)) {
  console.error('bootstrap-icons is not installed. run: npm i --no-save bootstrap-icons')
  process.exit(1)
}
if (!fs.existsSync(mappingPath)) {
  console.error('compiled mapping not found. run: npx tsc')
  process.exit(1)
}

const { EVENT_ICONS } = require(mappingPath)

// The Chat nodes use their own mapping; include it so one run vendors every
// glyph the package ships.
const names = new Set(Object.values(EVENT_ICONS))
const chatMappingPath = path.join(root, 'dist', 'twitch', 'chat', 'twitch-chat-icons.js')
if (fs.existsSync(chatMappingPath)) {
  for (const name of Object.values(require(chatMappingPath).CHAT_ICONS)) names.add(name)
}
const sorted = [...names].sort()

const glyphs = {}
for (const name of sorted) {
  const file = path.join(iconsDir, `${name}.svg`)
  const svg = fs.readFileSync(file, 'utf8')
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? '0 0 16 16'
  const body = svg
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>[\s\S]*$/, '')
    .trim()
  glyphs[name] = { viewBox, body }
}

const output = {
  source: `Bootstrap Icons v${require(iconsPkg).version} (MIT)`,
  glyphs,
}
fs.mkdirSync(path.join(root, 'src', 'icons'), { recursive: true })
fs.writeFileSync(path.join(root, 'src', 'icons', 'glyphs.json'), `${JSON.stringify(output, null, 2)}\n`)
console.log(`wrote ${sorted.length} glyphs to src/icons/glyphs.json`)
