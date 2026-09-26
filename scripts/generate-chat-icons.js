#!/usr/bin/env node
'use strict'

/**
 * Emits one editor icon per Twitch Chat node, using the same white-on-40x60
 * canvas as the EventSub icons so the palette stays visually consistent. Icons
 * are written to `dist/twitch/icons` (the module's declared icons directory).
 *
 * The glyph mapping lives in `src/twitch/chat/twitch-chat-icons.ts`; glyph paths
 * are vendored in `src/icons/glyphs.json` by `scripts/collect-glyphs.js`.
 */

const fs = require('fs')
const path = require('path')

const { renderGlyphIcon } = require('./render-glyph-icon')

const root = path.resolve(__dirname, '..')
const outDir = path.join(root, 'dist', 'twitch', 'icons')
const mappingPath = path.join(root, 'dist', 'twitch', 'chat', 'twitch-chat-icons.js')

const { CHAT_ICONS, chatIconFor } = require(mappingPath)
const { glyphs } = require(path.join(root, 'src', 'icons', 'glyphs.json'))

// Fail loudly instead of falling back, so an unvendored glyph is caught at build
// time rather than shipping a node with no icon.
const unmapped = Object.entries(CHAT_ICONS).filter(([, glyph]) => !glyphs[glyph])
if (unmapped.length) {
  console.error('no vendored glyph for these Chat nodes:')
  for (const [type, glyph] of unmapped) console.error(`  ${type} -> ${glyph}`)
  console.error('add the glyph name in src/twitch/chat/twitch-chat-icons.ts and run scripts/collect-glyphs.js')
  process.exit(1)
}

fs.mkdirSync(outDir, { recursive: true })

for (const [type, glyph] of Object.entries(CHAT_ICONS)) {
  fs.writeFileSync(path.join(outDir, chatIconFor(type)), renderGlyphIcon(glyphs, glyph))
}

console.log(`generated ${Object.keys(CHAT_ICONS).length} Chat node icons`)
