#!/usr/bin/env node
'use strict'

/**
 * Secret redaction test.
 *
 * A Twurple auth failure embeds the failing request URL, so `error.message`
 * carries the client secret and refresh token. Those must not reach a status
 * badge, the config dialog or the logs. There is no test framework: it runs
 * against the built dist/ output and any failed assert exits non-zero.
 */

const assert = require('assert')
const path = require('path')

const root = path.join(__dirname, '..', '..')
const { redactSecrets, redactStatusText, redactError } = require(
  path.join(root, 'dist', 'twitch', 'twitch-shared.js')
)

// The secret can appear as a query value, a JSON field or a Bearer header.
assert.strictEqual(
  redactSecrets('token?client_secret=Q&refresh_token=R'),
  'token?client_secret=[redacted]&refresh_token=[redacted]'
)
assert.strictEqual(
  redactSecrets('{"client_secret":"JQ","refresh_token":"JR"}'),
  '{"client_secret":"[redacted]","refresh_token":"[redacted]"}'
)
assert.strictEqual(redactSecrets('Authorization: Bearer BEAR'), 'Authorization: Bearer [redacted]')
assert.strictEqual(redactSecrets('client_secret%3DENC'), 'client_secret=[redacted]')
// Nothing secret-looking, nothing changed.
assert.strictEqual(redactSecrets('invalid client secret'), 'invalid client secret')

// A non-Error rejection must not crash, and the cap counts code points so it
// cannot split an emoji surrogate pair.
assert.strictEqual(redactStatusText(undefined), '')
assert.strictEqual(redactStatusText('\u{1F600}'.repeat(300)), `${'\u{1F600}'.repeat(200)}…`)

// Logging gets a redacted copy and leaves the original error untouched.
const original = new Error('boom client_secret=SEC&refresh_token=REF')
const copy = redactError(original)
assert.ok(copy instanceof Error, 'redactError did not return an Error')
assert.ok(!/SEC|REF/.test(copy.message), 'redactError left a secret in the message')
assert.ok(/SEC|REF/.test(original.message), 'redactError mutated the original error')

// The config node publishes the redacted status to its listeners.
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
require(path.join(root, 'dist', 'twitch', 'twitch-api-config.js'))(RED)
const config = new captured['twitch-api-config']({ id: 'cfg-1', name: 'twitch' })
config.nodeListeners['n1'] = { status: (status) => published.push(status) }
config.updateStatus({ fill: 'red', shape: 'ring', text: 'Auth failed: client_secret=SEC&refresh_token=REF' })
assert.ok(!/SEC|REF/.test(config.currentStatus.text), 'the config node status leaked a secret')
assert.ok(!/SEC|REF/.test(JSON.stringify(published)), 'the config node published a secret to listeners')

console.log('redact-secrets test: ok')
