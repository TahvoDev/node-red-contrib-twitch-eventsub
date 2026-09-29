# Security

This package moves untrusted data between Twitch and Node-RED. This document
describes the threat model, the controls that are in place, and how to report a
problem.

## Threat model

Anything that did not originate in this repository's own source is untrusted:

- Twitch IRC chat (sender name, display name, message text, badges, colour, id).
- EventSub WebSocket events (names, ids, titles, reason/message text, raw event).
- Helix REST responses (titles, descriptions, display names, URLs).
- Node configuration values entered in the editor (channel, command, endpoint,
  fields, mock server settings, client id).
- Incoming `msg.*` properties on every node input (`payload`, `text`, `channel`,
  `targetUser`, `targetUserId`, `reason`, `duration`, `replyTo`, `action`, field
  overrides, `cursor`, and the `isMod`/`isSubscriber`/`isVip`/`isBroadcaster`
  flags).
- OAuth HTTP responses and admin request bodies.
- Any user-influenced URL.

A hostile actor is assumed to be able to send arbitrary chat text, forge a
webhook body (but not sign it), and craft a flow message. They are assumed **not**
to have a valid Twitch access token, the Node-RED admin credential, or the
ability to read the process memory.

## Controls

### One sanitizer for every external string

`src/security/` exposes a single reusable entry point, `sanitize(value, policy)`,
with policies for `chat`, `irc`, `login`, `userId`, `channel`, `text`, `status`,
`log`, `html` and `topic`. Every node routes external strings through it (or one
of the named helpers it delegates to) before the value can reach an IRC line, a
URL, a status/log or the editor DOM.

It performs Unicode NFKC normalisation; removes C0/C1 control characters, bidi
overrides (`U+202A–202E`, `U+2066–2069`) and zero-width characters; converts
CR/LF/tab/NUL to a space where word separation matters; and caps the result by
code point.

Branded types (`SafeChatText`, `SafeIrcLine`, `TwitchLogin`, `TwitchUserId`,
`SafeLogLine`, `SafeHtml`) are only produced by the sanitizer, so passing a raw
string to a known sink is a compile error.

### IRC output

`toIrcLine` rejects CR/LF/NUL, caps at 500 code points, and neutralises a leading
`/` or `.` (Twitch treats those as commands) unless the command is on a node's
explicit allowlist. Outgoing chat is token-bucket rate limited; inbound line
buffers are capped so a flood cannot grow memory.

### Boundaries and object hygiene

`validateSchema` is a small, strict validator (no unknown keys) applied to node
config, inbound `msg` shapes, Helix parameters and HTTP request bodies. It never
copies a key it was not told about, so `__proto__`, `constructor` and
`prototype` cannot ride in on external data. `safeMerge` replaces
`Object.assign` for external data, `safeParseTags` parses IRCv3 tags into a `Map`
with a key allowlist, and `sanitizeDeep` walks a payload and sanitizes its
strings without recursion blow-ups.

URLs are built with `buildUrl` against a host/path allowlist; no URL is
assembled with string concatenation.

### EventSub

The shipped transport is ElectricSheep/EventSub **WebSocket**, so there is no
HTTP webhook receiver to forge. `src/security/webhook.ts` provides the
verification for a future receiver: HMAC-SHA256 over `id + timestamp + rawBody`
(computed from the raw body captured **before** JSON parsing), compared with
`crypto.timingSafeEqual`, a 10-minute timestamp window, and bounded message-id
dedupe.

### OAuth and admin

Every `RED.httpAdmin` route requires `RED.auth.needsPermission`
(`twitch-eventsub.read` / `twitch-eventsub.write`); admin users need that
permission or `*`. Request bodies are limited to 8 KB and validated. Credentials
are stored only through Node-RED credentials and never written to `msg` or logs;
log lines pass through `redactSecrets`.

The device-code flow has no redirect callback, so there is no OAuth `state`
parameter to validate. If a redirect-based flow is added, generate a random,
single-use `state` and compare it on callback.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Report it privately
using GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on the repository, or email the maintainer listed in `package.json`. Include a
reproduction and the affected version; we aim to acknowledge within a few days.

## Verifying

```sh
npm run typecheck      # strict, noImplicitAny
npm run lint           # eslint-plugin-security / no-unsanitized
node scripts/check-forbidden-patterns.js
npm run build          # build + unit tests
npm run test:coverage  # >=90% lines/functions on src/security
npm run audit          # runtime dependency audit
```
