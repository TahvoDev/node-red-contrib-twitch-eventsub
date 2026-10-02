#!/usr/bin/env node
'use strict'

/**
 * Config-node auth route test.
 *
 * Drives `POST /twitch-eventsub/auth/verify` with a stubbed fetch: a valid pair, a
 * pair Twitch refuses, a Twitch-side failure, an unreachable Twitch and the
 * missing-field guard. The status codes matter as much as the bodies — the
 * editor reads a 400 as "Client ID or Client Secret is not valid" and shows
 * anything else as a connection failure, so a 5xx must not masquerade as a bad
 * paste.
 *
 * Runs against the built dist/ output. Any failed assert throws and exits
 * non-zero, failing `npm run test:unit`, `npm run check` and `npm run build`.
 */

const assert = require('assert')
const path = require('path')

const root = path.join(__dirname, '..', '..')

// A minimal RED: collect the admin routes the config node registers.
const routes = {}
require(path.join(root, 'dist', 'twitch', 'twitch-api-config.js'))({
  httpAdmin: {
    get: (route) => { routes[`GET ${route}`] = true },
    post: (route, fn) => { routes[`POST ${route}`] = fn },
  },
  nodes: { registerType: () => {}, createNode: () => {}, getCredentials: () => ({}) },
})

const verify = routes['POST /twitch-eventsub/auth/verify']
assert.strictEqual(typeof verify, 'function', 'the verify route is registered')

// Calls the handler and resolves with [status, body].
function call(body) {
  return new Promise((resolve) => {
    const res = {
      code: 200,
      status(code) { this.code = code; return this },
      json(payload) { resolve([this.code, payload]); return this },
    }
    verify({ body }, res)
  })
}

// Makes Twitch answer with a given status.
function twitchSays(status) {
  global.fetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
  })
}

;(async () => {
  const valid = { client_id: 'abc', client_secret: 'sec' }

  let sent = null
  global.fetch = async (url, opts) => {
    sent = {
      url,
      body: opts.body.toString(),
      signal: opts.signal && opts.signal.constructor.name,
    }
    return { ok: true, status: 200, json: async () => ({}) }
  }

  let [code, body] = await call(valid)
  assert.strictEqual(code, 200)
  assert.deepStrictEqual(body, { ok: true })
  assert.match(sent.url, /id\.twitch\.tv\/oauth2\/token/)
  assert.match(sent.body, /grant_type=client_credentials/)
  assert.match(sent.body, /client_id=abc/)
  assert.match(sent.body, /client_secret=sec/)
  // The editor waits on this behind a button, so the call cannot hang forever.
  assert.strictEqual(sent.signal, 'AbortSignal', 'the request carries a timeout signal')

  twitchSays(400)
  ;[code, body] = await call({ client_id: 'abc', client_secret: 'wrong' })
  assert.strictEqual(code, 400)
  assert.match(body.error, /Client ID or Client Secret is not valid/)

  // Twitch being unwell must not read as a bad paste.
  twitchSays(503)
  ;[code, body] = await call(valid)
  assert.strictEqual(code, 503)
  assert.match(body.error, /Twitch returned 503/)

  global.fetch = async () => { throw new Error('offline') }
  ;[code, body] = await call(valid)
  assert.strictEqual(code, 500)
  assert.match(body.error, /offline/)

  ;[code, body] = await call({ client_id: 'abc' })
  assert.strictEqual(code, 400)
  assert.match(body.error, /Missing client_id or client_secret/)

  console.log('config auth routes test: ok')
})().catch((err) => {
  console.error('config auth routes test failed:', err.message)
  process.exit(1)
})
