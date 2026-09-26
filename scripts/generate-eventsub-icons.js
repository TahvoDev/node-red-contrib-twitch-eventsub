#!/usr/bin/env node
'use strict'

/**
 * Emits one editor icon per EventSub node: the event glyph in white, scaled to
 * fill the whole 24x24 canvas. They are written to `dist/twitch/icons` (next to
 * the Twitch icon) because Node-RED only discovers icons from an `icons`
 * directory beside a registered node file.
 *
 * The glyph paths are vendored from Bootstrap Icons (MIT) in `src/icons/glyphs.json`
 * by `scripts/collect-glyphs.js`; the mapping lives in `eventsub-icons.ts`.
 */

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const distDir = path.join(root, 'dist', 'twitch', 'eventsub')
const outDir = path.join(root, 'dist', 'twitch', 'icons')

const { EVENTS } = require(path.join(distDir, 'eventsub-registry.js'))
const { glyphFor } = require(path.join(distDir, 'eventsub-icons.js'))
const { glyphs } = require(path.join(root, 'src', 'icons', 'glyphs.json'))

// The glyph is white; the node body supplies the colour. The icon fills the full
// 24x24 viewBox so Node-RED's `background-size: contain` renders it edge to edge.
const ICON_COLOR = '#ffffff'
const GLYPH_SIZE = 24
const GLYPH_ORIGIN = 0

function renderIcon(glyphName) {
  const glyph = glyphs[glyphName]
  if (!glyph) throw new Error(`missing glyph: ${glyphName} (run scripts/collect-glyphs.js)`)

  const [gx, gy, gw, gh] = glyph.viewBox.split(/\s+/).map(Number)
  const scale = GLYPH_SIZE / Math.max(gw, gh)

  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
    `<g transform="translate(${GLYPH_ORIGIN} ${GLYPH_ORIGIN}) scale(${scale}) translate(${-gx} ${-gy})" fill="${ICON_COLOR}">${glyph.body}</g>` +
    '</svg>\n'
  )
}

fs.mkdirSync(outDir, { recursive: true })

for (const definition of EVENTS) {
  fs.writeFileSync(path.join(outDir, definition.icon), renderIcon(glyphFor(definition.type)))
}

console.log(`generated ${EVENTS.length} EventSub node icons`)
