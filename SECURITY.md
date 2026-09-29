# Security

This document describes the threat model and the controls this package applies.

**Scope.** The untrusted data is what comes **from Twitch** — chat text, EventSub
event fields, Helix response strings, OAuth responses. Those are cleaned before a
consumer can render, log or forward them. The flow builder is trusted: node
config and the `msg.*` they (or an upstream node they chose) send are their own
input, and what actually goes **to** Twitch is validated and neutralised by
Twurple. We do not duplicate Twurple's wire-level work.

## Threat model

Untrusted (from Twitch):

- IRC chat: sender login/display name/id, message text, badges, colour, message id.
- EventSub WebSocket events: names, ids, titles, reason/message text, the raw event.
- Helix REST responses: titles, descriptions, display names, URLs.
- OAuth responses: user id/login, verification URI, user code.

Trusted (the builder's own input):

- Node configuration entered in the editor or imported with a flow.
- `msg.*` on a node input (payload, text, channel, targetUser, reason, action,
  field overrides, and the `isMod`/`isSubscriber`/`isVip`/`isBroadcaster` flags).
  Note that a flow may wire another source into these nodes, so an author who
  does that owns the result; role checks are still verified against Twitch where
  it matters (below).

A hostile actor is assumed to be able to send arbitrary chat text and craft a
webhook body (but not sign it). They are assumed **not** to have a Twitch access
token, the Node-RED admin credential, or process memory access.

## Controls

### Twitch-origin sanitization

`src/security/` cleans strings that originated at Twitch. `sanitize(value, policy)`
is the entry point; policies are `text`, `topic`, `status`, `log` and `html`. It
folds CR/LF/tab/NUL to a space, drops the remaining C0/C1 control characters and
the bidi overrides/isolates (`U+202A–202E`, `U+2066–2069`), and caps by code
point.

It deliberately does **not** NFKC-normalise, and keeps zero-width joiners and
bidi marks: Twitch permits them, they are required for legitimate emoji
(`👨‍👩‍👧`, ZWJ) and RTL/Arabic/Hebrew text, and NFKC would rewrite legitimate
`①`/full-width text. Twitch already rejects CR/LF/NUL in chat, so that part is
defense in depth.

Applied to:

- `twitch-chat-in` — the message text and the sender's display name (the two
  user-chosen fields) are sanitized before they become `msg.payload`/`msg.text`/
  `msg.displayName`. Twitch-assigned metadata — the numeric user id, message id,
  login and hex colour — is passed through as-is: a chatter cannot forge it and
  it is not free text.
- `twitch-eventsub` — the mapped convenience fields are deep-sanitized
  (`sanitizeDeep`) before they become `msg.payload`.
- OAuth responses — the user id/login are validated before being stored.
- Node status and log text — sanitized (`sanitizeStatus`/`sanitizeLogLine`) and
  secrets redacted (`redactSecrets`).

`SafeLogLine`/`SafeHtml` brands mark sanitized status and HTML; a cast can defeat
a brand, so it is a guard-rail, not runtime enforcement.

**Not sanitized:** Helix response strings from the `twitch-api` node are returned
as Twurple provides them (sanitizing every title/description would rewrite
legitimate data). Escape them with `escapeHtml` / the `html` policy before
rendering into a template or Dashboard.

### Raw escape hatches

- `twitch-eventsub` leaves the declared `rawEvent` field untouched (it is
  documented as the full event) and copies it to `msg.twitch.raw`.
- `twitch-chat-in` puts the original text in `msg.twitch.raw` and the Twurple
  message object in `msg._raw`.

`msg.twitch.untrusted` is always `true`. **Treat `msg.twitch.raw`, `msg._raw` and
`rawEvent` as untrusted**: escape them before any HTML, template or shell sink.

### Chat authorization

`twitch-chat-command`'s role gates must not trust `msg.isMod` / `msg.isBroadcaster`
/ `msg.isSubscriber` / `msg.isVip`, because an upstream node can set them.

- **Configure a Connection on the command node** (recommended, verified mode): the
  sender id from the chat message is checked against Twitch
  (`moderation.checkUserIsModerator`, `subscriptions.checkUserSubscription`, the VIP
  list) as the authenticated account. Forged flags are ignored and the check fails
  closed.
- Without a Connection the node falls back to the legacy message flags and logs a
  warning. That mode is **unverified**; add a Connection to close it.

The destructive nodes (ban/timeout/unban/delete/announce/clear) act as the
configured account, so the command node is the authorization point — do not wire a
destructive node to a source where untrusted input can reach it directly.

### Object hygiene and boundaries

`validateSchema` (strict, no unknown keys) validates the admin HTTP request bodies.
`safeMerge` replaces `Object.assign` when merging externally shaped objects, and
`sanitizeDeep` walks EventSub payloads. None of them copies `__proto__`,
`constructor` or `prototype` from the input.

Admin routes require Node-RED's built-in editor permissions (`flows.read` /
`flows.write`); a standard `adminAuth` config already grants these to flow editors.
Request bodies are capped at 8 KB (declared and actual size). Credentials are
stored only through Node-RED credentials and never written to `msg` or logs.

The device-code flow has no redirect callback, so there is no OAuth `state` to
validate. If a redirect-based flow is added, generate a random single-use `state`
and compare it on callback.

### EventSub

The shipped transport is EventSub **WebSocket**, so there is no HTTP webhook
receiver to forge. `src/security/webhook.ts` provides verification for a future
receiver: HMAC-SHA256 over `id + timestamp + rawBody` (from the raw body, captured
before JSON parsing), `crypto.timingSafeEqual`, a 10-minute timestamp window and
bounded message-id dedupe.

## What Twurple already does (why we don't duplicate it)

- IRC wire safety: `AbstractConnection.sendLine` removes `\0\r\n` from every
  outgoing line, so a message cannot inject a second IRC line.
- Channel/login validation: `toUserName` (`^[a-z0-9][a-z0-9_]{0,24}$`) and
  `isChannel` reject invalid names and throw.
- IRCv3 tag parsing: the `ircv3` parser builds a prototype-safe `Map`.
- Rate limits: `ChatClient` limits per channel and `ApiClient` per Helix bucket,
  using Twitch's own headers.
- URL/body building: `@twurple/api-call` builds requests from a fixed base plus
  `@d-fischer/qs`/`JSON.stringify`.

`buildUrl` remains for this package's own admin `fetch` calls, which Twurple does
not make. `normalizeChannel` is plain lower-casing/#-stripping of the builder's
value; Twurple validates the result when the node joins or sends.

## Library-only utilities

Implemented and unit-tested, but with no in-repo caller:

- `src/security/webhook.ts` — webhook HMAC/replay guard for a future HTTP receiver.
- `BoundedBuffer` — a fixed-size inbound buffer.
- `escapeHtml` / the `html` policy — for consumers rendering into a Dashboard or
  template.
- `Untrusted<T>` — an opt-in marker type for consumers typing their own boundaries.

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
