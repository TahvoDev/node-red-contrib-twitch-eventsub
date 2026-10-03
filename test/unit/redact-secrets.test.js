#!/usr/bin/env node
'use strict'

/**
 * Secret redaction test.
 *
 * A Twurple auth failure embeds the failing request URL and form body in
 * `error.message`, so the client secret and refresh token travel with the error
 * into a status badge, the config dialog and the logs. There is no test
 * framework: it runs against the built dist/ output and any failed assert exits
 * non-zero.
 */

const assert = require('assert')
const path = require('path')

const root = path.join(__dirname, '..', '..')
const { redactSecrets, redactStatusText, safeErrorMessage, redactError } = require(
  path.join(root, 'dist', 'twitch', 'twitch-shared.js')
)

// The real Twurple error is preferred, but the test must not depend on a
// transitive package being hoisted, so a duck-typed stand-in with the same
// message shape is used if the import fails.
let makeHttpError
try {
  const { HttpStatusCodeError } = require('@twurple/api-call')
  makeHttpError = (body) =>
    new HttpStatusCodeError(400, 'Bad Request', 'https://id.twitch.tv/oauth2/token', 'POST', body, false)
} catch {
  makeHttpError = (body) => {
    const error = new Error(
      `Encountered HTTP status code 400: Bad Request\n\nURL: https://id.twitch.tv/oauth2/token\nMethod: POST\nBody:\n${body}`
    )
    error.statusCode = 400
    error.url = 'https://id.twitch.tv/oauth2/token'
    return error
  }
}

// Every shape a secret can reach free text in: query value, form body, JSON
// field, percent-encoded separator and a Bearer header.
assert.strictEqual(
  redactSecrets('token?client_secret=Q&refresh_token=R'),
  'token?client_secret=[redacted]&refresh_token=[redacted]'
)
assert.strictEqual(
  redactSecrets('grant_type=refresh_token&client_id=a&client_secret=SEC&refresh_token=REF'),
  'grant_type=refresh_token&client_id=a&client_secret=[redacted]&refresh_token=[redacted]'
)
assert.strictEqual(
  redactSecrets('{"client_secret":"JQ","refresh_token":"JR"}'),
  '{"client_secret":"[redacted]","refresh_token":"[redacted]"}'
)
assert.strictEqual(redactSecrets('Authorization: Bearer BEAR'), 'Authorization: Bearer [redacted]')
assert.strictEqual(redactSecrets('client_secret%3DENC'), 'client_secret=[redacted]')
// Nothing secret-looking, nothing changed: the grant type is a value, not a key.
assert.strictEqual(redactSecrets('invalid client secret'), 'invalid client secret')

// A non-Error rejection must not crash, and the cap counts code points so it
// cannot split an emoji surrogate pair.
assert.strictEqual(redactStatusText(undefined), '')
assert.strictEqual(redactStatusText('\u{1F600}'.repeat(300)), `${'\u{1F600}'.repeat(200)}…`)

// safeErrorMessage drops URL/Method/Body for a real Twurple HTTP error, so the
// secret never has to be scrubbed out of the message in the first place.
const httpError = makeHttpError(
  'grant_type=refresh_token&client_id=abc&client_secret=SECRET&refresh_token=REFRESH'
)
const safe = safeErrorMessage(httpError)
assert.strictEqual(safe, 'Encountered HTTP status code 400: Bad Request')
assert.ok(!/SECRET|REFRESH/.test(safe), 'safeErrorMessage kept a secret')
assert.ok(!/URL:|Body:/.test(safe), 'safeErrorMessage kept the URL/body sections')

// The regex backstop still cleans the raw message if anything bypasses it.
const scrubbed = redactSecrets(httpError.message)
assert.ok(!/SECRET|REFRESH/.test(scrubbed), 'redactSecrets left a secret')

// Logging gets a redacted copy and leaves the original error untouched.
const original = new Error('boom client_secret=SEC&refresh_token=REF')
const copy = redactError(original)
assert.ok(copy instanceof Error, 'redactError did not return an Error')
assert.ok(!/SEC|REF/.test(copy.message), 'redactError left a secret in the message')
assert.ok(!/SEC|REF/.test(copy.stack || ''), 'redactError left a secret in the stack')
assert.ok(/SEC|REF/.test(original.message), 'redactError mutated the original error')

const httpCopy = redactError(httpError)
assert.ok(httpCopy instanceof Error, 'redactError did not copy the Twurple error')
assert.ok(!/SECRET|REFRESH/.test(httpCopy.message), 'redactError left a secret in the Twurple message')
assert.ok(!/SECRET|REFRESH/.test(httpCopy.stack || ''), 'redactError left a secret in the Twurple stack')

// The config node publishes the redacted status to its own status and listeners.
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
