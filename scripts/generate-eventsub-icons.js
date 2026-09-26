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

// The glyph is white; the node body supplies the colour. The canvas matches the
// 40x60 viewBox of Node-RED's stock icons, with the glyph inset so it keeps the
// same breathing room on the workspace node.
const ICON_COLOR = '#ffffff'
const CANVAS_WIDTH = 40
const CANVAS_HEIGHT = 60
const GLYPH_SIZE = 26

function renderIcon(glyphName) {
  const glyph = glyphs[glyphName]
  if (!glyph) throw new Error(`missing glyph: ${glyphName} (run scripts/collect-glyphs.js)`)

  const [gx, gy, gw, gh] = glyph.viewBox.split(/\s+/).map(Number)
  const scale = GLYPH_SIZE / Math.max(gw, gh)
  const x = (CANVAS_WIDTH - gw * scale) / 2 - gx * scale
  const y = (CANVAS_HEIGHT - gh * scale) / 2 - gy * scale

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}">` +
    `<g transform="translate(${x} ${y}) scale(${scale})" fill="${ICON_COLOR}">${glyph.body}</g>` +
    '</svg>\n'
  )
}

fs.mkdirSync(outDir, { recursive: true })

for (const definition of EVENTS) {
  fs.writeFileSync(path.join(outDir, definition.icon), renderIcon(glyphFor(definition.type)))
}

console.log(`generated ${EVENTS.length} EventSub node icons`)
