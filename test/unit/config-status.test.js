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

console.log(`config-status test: ok (${greens.length} green status, all dots)`)