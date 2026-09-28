#!/usr/bin/env node
'use strict'

/**
 * Emits one editor icon per EventSub node: the event glyph in white, centred on
 * the same 40x60 canvas Node-RED's own node icons use so it has the same padding
 * and does not touch the node edges. They are written to `dist/twitch/icons`
 * (next to the Twitch icon) because Node-RED only discovers icons from an `icons`
 * directory beside a registered node file.
 *
 * The glyph paths are vendored from Bootstrap Icons (MIT) in `src/icons/glyphs.json`
 * by `scripts/collect-glyphs.js`; the mapping lives in `eventsub-icons.ts` and the
 * rendering is shared with the Chat icons in `scripts/render-glyph-icon.js`.
 */

const fs = require('fs')
const path = require('path')

const { renderGlyphIcon } = require('./render-glyph-icon')

const root = path.resolve(__dirname, '..')
const distDir = path.join(root, 'dist', 'twitch', 'eventsub')
const outDir = path.join(root, 'dist', 'twitch', 'icons')

const { EVENTS } = require(path.join(distDir, 'eventsub-registry.js'))
const { EVENT_ICONS, glyphFor } = require(path.join(distDir, 'eventsub-icons.js'))
const { glyphs } = require(path.join(root, 'src', 'icons', 'glyphs.json'))

// Fail loudly instead of silently falling back, so a new registry entry without
// an icon mapping is caught at build time.
const unmapped = EVENTS.filter((definition) => !EVENT_ICONS[definition.type.replace(/^twitch-eventsub-/, '')])
if (unmapped.length) {
  console.error('no icon mapped for these EventSub events:')
  for (const definition of unmapped) console.error(`  ${definition.type}`)
  console.error('add a glyph name for each in src/twitch/eventsub/eventsub-icons.ts')
  process.exit(1)
}

fs.mkdirSync(outDir, { recursive: true })

for (const definition of EVENTS) {
  fs.writeFileSync(path.join(outDir, definition.icon), renderGlyphIcon(glyphs, glyphFor(definition.type)))
}

console.log(`generated ${EVENTS.length} EventSub node icons`)
