#!/usr/bin/env node
'use strict'

/**
 * Emits one Node-RED node module (.js + .html) per Helix spec, generated from
 * the compiled spec list. Node-RED identifies a node by its package.json
 * "node-red"."nodes" entry and expects each entry to point at a file that
 * registers exactly that type, so the thin stubs and the editor files live here
 * rather than being hand-maintained.
 */

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const distDir = path.join(root, 'dist', 'twitch', 'helix')
const outDir = path.join(distDir, 'generated')

const { HELIX_SPECS } = require(path.join(distDir, 'specs', 'index.js'))
const { renderEditorHtml } = require(path.join(distDir, 'helix-editor.js'))

fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

for (const spec of HELIX_SPECS) {
  const stub = [
    "'use strict';",
    '',
    "const { registerHelixNode } = require('../factory');",
    '',
    `module.exports = (RED) => registerHelixNode(RED, ${JSON.stringify(spec.type)});`,
    '',
  ].join('\n')

  fs.writeFileSync(path.join(outDir, `${spec.type}.js`), stub)
  fs.writeFileSync(path.join(outDir, `${spec.type}.html`), renderEditorHtml(spec))
}

console.log(`generated ${HELIX_SPECS.length} Helix node modules`)
