#!/usr/bin/env node
'use strict'

/**
 * EventSub service test.
 *
 * The service tracks one live Twurple subscription per event type now that a
 * node's event can be changed in place. This asserts the reference counting: the
 * last node for a type unsubscribes, and a resubscribe (socket restore / retry)
 * replaces the previous subscription instead of leaking it. Runs against the
 * built dist/ output; any failed assert throws and exits non-zero.
 */

const assert = require('assert')
const path = require('path')

const { TwitchEventsubService } = require(
  path.join(__dirname, '..', '..', 'dist', 'twitch', 'eventsub', 'twitch-eventsub-service.js')
)

const FOLLOW = 'twitch-eventsub-channel-follow'

function makeService() {
  const stops = []
  const svc = new TwitchEventsubService({ log() {}, warn() {}, error() {} }, 'user-id', {})
  // Stub the listener method the follow event's subscribe() calls, so no Twurple
  // network work happens and we can observe stop().
  svc.listener.onChannelFollow = () => ({ stop() { stops.push(FOLLOW) } })
  return { svc, stops }
}

// Two nodes for the type: removing one keeps the subscription, the last one stops it.
{
  const { svc, stops } = makeService()
  svc.started = true
  svc.addSubscription(FOLLOW)
  svc.addSubscription(FOLLOW)

  svc.removeSubscription(FOLLOW)
  assert.strictEqual(stops.length, 0, 'stopped while a node still used the type')
  assert.strictEqual(svc.activeSubscriptions.size, 1)
  assert.strictEqual(svc.subscriptionCounts.get(FOLLOW), 1)

  svc.removeSubscription(FOLLOW)
  assert.strictEqual(stops.length, 1, 'last node did not unsubscribe')
  assert.strictEqual(svc.activeSubscriptions.size, 0)
  assert.strictEqual(svc.subscriptionCounts.has(FOLLOW), false)
}

// Resubscribing the same type (restore/retry) replaces the old subscription.
{
  const { svc, stops } = makeService()
  svc.registerSubscription(FOLLOW)
  svc.registerSubscription(FOLLOW)
  assert.strictEqual(stops.length, 1, 'old subscription leaked on resubscribe')
  assert.strictEqual(svc.activeSubscriptions.size, 1)
}

console.log('eventsub service ok')
