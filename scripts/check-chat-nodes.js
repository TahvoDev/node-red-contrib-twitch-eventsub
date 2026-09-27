#!/usr/bin/env node
'use strict'

/**
 * Asserts the message-property rules the chat nodes rely on, so a change to one
 * node cannot quietly break the node it is wired to.
 */

const assert = require('assert')
const path = require('path')

const base = require(path.join(__dirname, '..', 'dist', 'twitch', 'chat', 'twitch-chat-base.js'))
const { normalizeChannel, resolveUserId, resolveAnnounceColor } = base

// twitch-chat-in emits the sender's chat colour as msg.color; it is a hex value,
// not one of Twitch's announcement colours, and must not fail the announcement.
assert.strictEqual(resolveAnnounceColor({ color: '#FF0000' }), 'primary')
assert.strictEqual(resolveAnnounceColor({}), 'primary')
assert.strictEqual(resolveAnnounceColor({ color: 'blu' }), 'primary')
assert.strictEqual(resolveAnnounceColor({ color: 'blue' }), 'blue')
assert.strictEqual(resolveAnnounceColor({ announceColor: 'purple' }), 'purple')
assert.strictEqual(resolveAnnounceColor({ color: '#FF0000', announceColor: 'green' }), 'green')

// Channel names arrive as '#Name', ' name ' or as a number, from config or msg.
assert.strictEqual(normalizeChannel('#SomeChannel'), 'somechannel')
assert.strictEqual(normalizeChannel('  other  '), 'other')
assert.strictEqual(normalizeChannel(undefined), '')

;(async () => {
  // A caller that already has the numeric id must not pay for a lookup.
  const ctx = { users: { getUserByName: async () => { throw new Error('should not be called') } } }
  assert.strictEqual(await resolveUserId(ctx, 12345), '12345')
  await assert.rejects(() => resolveUserId(ctx, '   '), /Target user is required/)
  await assert.rejects(
    () => resolveUserId({ users: { getUserByName: async () => null } }, 'ghost'),
    /could not be found/
  )
  console.log('chat node message properties: ok')
})().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
