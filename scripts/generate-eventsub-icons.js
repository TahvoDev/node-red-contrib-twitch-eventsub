#!/usr/bin/env node
'use strict'

/**
 * Emits one editor icon per EventSub node: the event glyph in white with a small
 * Twitch mark in the bottom-right corner. They are written to `dist/twitch/icons`
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

// The EventSub nodes use Twitch purple, so the glyph is white and the mark in the
// corner uses the same purple to read as a knockout.
const NODE_COLOR = '#9146FF'
const GLYPH_SIZE = 11.5
const GLYPH_ORIGIN = 3.5
const MARK = 'M1.7 6.058.015 10.362v17.594h5.99v3.181h3.368l3.182-3.181h4.866l6.551-6.551V6.058Zm20.026 14.224-3.743 3.743h-5.99l-3.181 3.182v-3.182H3.758V8.304h17.968Zm-3.743-7.673v6.544h-2.246v-6.544zm-5.99 0v6.544H9.749v-6.544z'

function renderIcon(glyphName) {
  const glyph = glyphs[glyphName]
  if (!glyph) throw new Error(`missing glyph: ${glyphName} (run scripts/collect-glyphs.js)`)

  const [gx, gy, gw, gh] = glyph.viewBox.split(/\s+/).map(Number)
  const scale = GLYPH_SIZE / Math.max(gw, gh)

  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
    `<g transform="translate(${GLYPH_ORIGIN} ${GLYPH_ORIGIN}) scale(${scale}) translate(${-gx} ${-gy})" fill="#ffffff">${glyph.body}</g>` +
    `<path transform="translate(16.9 15.4) scale(0.205)" fill="${NODE_COLOR}" d="${MARK}"/>` +
    '</svg>\n'
  )
}

fs.mkdirSync(outDir, { recursive: true })

for (const definition of EVENTS) {
  fs.writeFileSync(path.join(outDir, definition.icon), renderIcon(glyphFor(definition.type)))
}

console.log(`generated ${EVENTS.length} EventSub node icons`)
