#!/usr/bin/env node
'use strict'

/**
 * OAuth scope test.
 *
 * The device-code login sends one space-separated list of every scope the
 * palette can need. Twitch rejects the *whole* request when it contains a scope
 * it does not know — 400 `invalid scope requested: '<name>'`, so one invented
 * name locks every user out of logging in. Two were: `channel:read:emotes`
 * (emote scopes are `user:read:emotes`) and `moderator:read:whispers` (it is
 * `user:read:whispers`).
 *
 * So every scope the package asks for has to exist in Twitch's list. Asserted
 * against the documented set below; runs against the built dist/ output, and any
 * failed assert throws and exits non-zero, failing `npm run test:unit`,
 * `npm run check` and `npm run build`.
 */

const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..', '..')
const configDist = path.join(root, 'dist', 'twitch', 'twitch-api-config.js')

// Every scope Twitch documents, from https://dev.twitch.tv/docs/authentication/scopes
const TWITCH_SCOPES = new Set(`
analytics:read:extensions analytics:read:games bits:read channel:bot
channel:edit:commercial channel:manage:ads channel:manage:broadcast channel:manage:clips
channel:manage:extensions channel:manage:guest_star channel:manage:moderators channel:manage:polls
channel:manage:predictions channel:manage:raids channel:manage:redemptions channel:manage:schedule
channel:manage:videos channel:manage:vips channel:moderate channel:read:ads
channel:read:charity channel:read:editors channel:read:goals channel:read:guest_star
channel:read:hype_train channel:read:polls channel:read:predictions channel:read:redemptions
channel:read:stream_key channel:read:subscriptions channel:read:vips chat:edit
chat:read clips:edit editor:manage:clips moderation:read
moderator:manage:announcements moderator:manage:automod moderator:manage:automod_settings moderator:manage:banned_users
moderator:manage:blocked_terms moderator:manage:chat_messages moderator:manage:chat_settings moderator:manage:guest_star
moderator:manage:shield_mode moderator:manage:shoutouts moderator:manage:suspicious_users moderator:manage:unban_requests
moderator:manage:warnings moderator:read:automod_settings moderator:read:banned_users moderator:read:blocked_terms
moderator:read:chat_messages moderator:read:chat_settings moderator:read:chatters moderator:read:followers
moderator:read:guest_star moderator:read:moderators moderator:read:shield_mode moderator:read:shoutouts
moderator:read:suspicious_users moderator:read:unban_requests moderator:read:vips moderator:read:warnings
user:bot user:edit user:edit:broadcast user:manage:blocked_users
user:manage:chat_color user:manage:whispers user:read:blocked_users user:read:broadcast
user:read:chat user:read:email user:read:emotes user:read:follows
user:read:moderated_channels user:read:subscriptions user:read:whispers user:write:chat
whispers:read
`.trim().split(/\s+/))

assert.ok(TWITCH_SCOPES.size > 60, `the scope list looks truncated (${TWITCH_SCOPES.size})`)

// The config node serves the exact list the Login with Twitch button sends, so
// read it back off that endpoint rather than re-deriving it from the source.
const routes = {}
require(configDist)({
  httpAdmin: { get: (url, handler) => { routes[url] = handler }, post() {} },
  settings: {},
  nodes: { createNode() {}, getCredentials: () => ({}), registerType() {} },
})

let requested
routes['/twitch-eventsub/helix/scopes'](null, { json: (body) => { requested = body.scopes } })

assert.ok(Array.isArray(requested) && requested.length > 40, 'the scopes endpoint returned nothing to check')

for (const scope of requested) {
  assert.ok(
    TWITCH_SCOPES.has(scope),
    `"${scope}" is not a scope Twitch documents; the device-code login would fail with 400 invalid scope requested`
  )
}

// The two that broke it, named so the failure says what regressed.
assert.ok(!requested.includes('channel:read:emotes'), 'channel:read:emotes is not a Twitch scope')
assert.ok(!requested.includes('moderator:read:whispers'), 'moderator:read:whispers is not a Twitch scope')
assert.ok(requested.includes('user:read:emotes'), 'emote reads need user:read:emotes')
assert.ok(requested.includes('user:read:whispers'), 'whisper reads need user:read:whispers')

console.log(`oauth-scope test: ok (${requested.length} requested, all documented)`)