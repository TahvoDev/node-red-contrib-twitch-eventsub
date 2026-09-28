'use strict'

/**
 * Renders a vendored Bootstrap Icons glyph into a Node-RED editor icon: the
 * glyph in white, centred on the same 40x60 canvas the stock icons use so it has
 * the same padding and does not touch the node edges. The node body supplies the
 * colour, so the glyph itself is always white.
 *
 * Shared by the EventSub and Chat icon generators.
 */

const ICON_COLOR = '#ffffff'
const CANVAS_WIDTH = 40
const CANVAS_HEIGHT = 60
const GLYPH_SIZE = 26

function renderGlyphIcon(glyphs, glyphName) {
  const glyph = glyphs[glyphName]
  if (!glyph) throw new Error(`missing glyph: ${glyphName} (run scripts/collect-glyphs.js)`)

  // SVG allows commas as well as whitespace between viewBox values.
  const [gx, gy, gw, gh] = glyph.viewBox.split(/[\s,]+/).map(Number)
  const scale = GLYPH_SIZE / Math.max(gw, gh)
  const x = (CANVAS_WIDTH - gw * scale) / 2 - gx * scale
  const y = (CANVAS_HEIGHT - gh * scale) / 2 - gy * scale

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}">` +
    `<g transform="translate(${x} ${y}) scale(${scale})" fill="${ICON_COLOR}">${glyph.body}</g>` +
    '</svg>\n'
  )
}

module.exports = { renderGlyphIcon }
