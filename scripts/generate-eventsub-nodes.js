#!/usr/bin/env node
'use strict'

/**
 * Emits one Node-RED node module (.js + .html) per EventSub event, all generated
 * from the compiled registry. Node-RED identifies a node by its package.json
 * "node-red"."nodes" entry and expects each entry to point at a file that registers
 * exactly that type, so the thin stubs live here rather than being hand-maintained.
 */

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const distDir = path.join(root, 'dist', 'twitch', 'eventsub')
const outDir = path.join(distDir, 'generated')

const { EVENTS } = require(path.join(distDir, 'eventsub-registry.js'))
const { renderEditorHtml } = require(path.join(distDir, 'eventsub-editor.js'))

fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

for (const definition of EVENTS) {
  const stub = [
    "'use strict';",
    '',
    "const { registerEventsubNode } = require('../eventsub-node');",
    '',
    `module.exports = (RED) => registerEventsubNode(RED, ${JSON.stringify(definition.type)});`,
    '',
  ].join('\n')

  fs.writeFileSync(path.join(outDir, `${definition.type}.js`), stub)
  fs.writeFileSync(path.join(outDir, `${definition.type}.html`), renderEditorHtml(definition))
}

console.log(`generated ${EVENTS.length} EventSub node modules`)
