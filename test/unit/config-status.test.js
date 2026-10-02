#!/usr/bin/env node
'use strict'

/**
 * Config node status test.
 *
 * The config dialog reports the node's real runtime status, which only works if
 * the config node publishes its own status (Node-RED keeps it and republishes it
 * to the editor) instead of only fanning it out to the dependent nodes.
 *
 * There is no test framework: it runs against the built dist/ output, and any
 * failed assert throws and exits non-zero, failing `npm run test:unit`,
 * `npm run check` and `npm run build`.
 */

const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..', '..')
const configDist = path.join(root, 'dist', 'twitch', 'twitch-api-config.js')
const editorDist = path.join(root, 'dist', 'twitch', 'twitch-api-config.html')

// A RED just real enough to register and construct the config node: createNode is
// where the runtime would put status()/on(), and both are recorded instead.
const published = []
const captured = {}
const RED = {
  httpAdmin: { get() {}, post() {} },
  settings: {},
  nodes: {
    createNode(node) {
      node.on = () => {}
      node.status = (status) => published.push(status)
    },
    getCredentials: () => ({}),
    registerType: (type, ctor) => { captured[type] = ctor },
  },
}

require(configDist)(RED)
assert.strictEqual(typeof captured['twitch-api-config'], 'function', 'twitch-api-config did not register')

const config = new captured['twitch-api-config']({ id: 'cfg-1', name: 'twitch' })

const before = published.length
const status = { fill: 'red', shape: 'ring', text: 'Auth failed: bad secret' }
config.updateStatus(status)

assert.strictEqual(published.length, before + 1, 'updateStatus did not publish the config node status')
assert.deepStrictEqual(published[published.length - 1], status)
assert.deepStrictEqual(config.currentStatus, status)

// Green has to mean connected, because the dialog colours a green ring as a live
// connection. Only the post-subscription dot may be green.
const source = fs.readFileSync(configDist, 'utf8')
const greens = [...source.matchAll(/fill:\s*["']green["'][^{}]*shape:\s*["'](\w+)["']/g)]
assert.ok(greens.length > 0, 'no green status found; is the config node still reporting one?')
for (const [, shape] of greens) assert.strictEqual(shape, 'dot', 'a green ring claims connected before it is')

// The dialog half. The runtime assertions above hold even if the editor goes back
// to inventing a status from the saved fields, so the editor is checked too: it
// has to read the runtime's status and map every fill it can receive.
const editor = fs.readFileSync(editorDist, 'utf8')

assert.match(editor, /const s = this\.status;/, 'the dialog no longer reads the runtime status')
assert.match(editor, /'Not connected'/, 'the dialog has no fallback for an unpublished status')
assert.match(editor, /\.auth-err \{ color: #c00; \}/, 'the red fill has no class to render')

// Every fill the runtime can publish, and only green may mean connected.
const FILL_CLASS = { green: 'auth-ok', yellow: 'auth-wait', red: 'auth-err', grey: 'auth-warn', blue: 'auth-wait' }
for (const fill of ['green', 'yellow', 'red', 'grey', 'blue']) {
  assert.match(
    editor,
    new RegExp(`\\b${fill}:\\s*'auth-[a-z]+'`),
    `the dialog does not map the ${fill} fill to a class`
  )
}

// The regression this exists for: a status built from the saved user id/login
// renders "connected" whether or not the runtime is.
assert.doesNotMatch(
  editor,
  /if \(this\.twitch_user_id && this\.twitch_user_login\)/,
  'the dialog fabricates a status from the saved fields again'
)
assert.doesNotMatch(
  editor,
  /Logged in as \$\{this\.twitch_user_login\}/,
  'the dialog reports a saved login as a live connection again'
)

// Device-flow completion is not a connection either — the token is only in the
// form until the next deploy — so it must not be the green (connected) class.
const deviceFlow = editor.slice(editor.indexOf('function startPolling'))
assert.match(
  deviceFlow,
  /setAuthStatus\([^)]*'auth-wait'/s,
  'device-flow completion is styled as connected before the runtime has run'
)
assert.doesNotMatch(
  deviceFlow,
  /Connected/,
  'device-flow completion still claims a live connection before the next deploy'
)

console.log(
  `config-status test: ok (${greens.length} green status all dots, dialog maps ${Object.keys(FILL_CLASS).length} fills)`
)
