#!/usr/bin/env node
'use strict'

/**
 * Inbound-normalisation test.
 *
 * Pins the exact behaviour `sanitizeInbound`/`sanitizeInboundString` promise:
 * a fixed order that is idempotent, no input mutation, control and invisible
 * characters removed, NFKC folding, a code-point cap and a depth/cycle bound.
 * A seeded mulberry32 property loop hammers the interesting alphabet so the
 * edges keep getting hit.
 *
 * Runs against the built dist/ output. Any failed assert throws and exits
 * non-zero, failing `npm run test:unit`, `npm run check` and `npm run build`.
 */

const assert = require('assert')
const path = require('path')

const {
  sanitizeInbound,
  sanitizeInboundString,
  escapeText,
  normalizeEscapeMode,
  MAX_INBOUND_STRING_LENGTH,
  MAX_INBOUND_DEPTH,
} = require(path.join(__dirname, '..', '..', 'dist', 'twitch', 'twitch-shared.js'))
const S = sanitizeInboundString

/* --------------------------------------------------------------- basics */

assert.strictEqual(S(null), '')
assert.strictEqual(S(undefined), '')
assert.strictEqual(S(42), '42')
assert.strictEqual(S('hello'), 'hello')

// U+2028/U+2029/U+0085 are line breaks to some parsers; they become spaces.
assert.strictEqual(S('a\u2028b\u2029c\u0085d'), 'a b c d')
// ESC and the C0/C1 controls are removed.
assert.strictEqual(S('\u001b[31mred\u0007\u007F\u009F'), '[31mred')
// Zero-width space, word joiner, BOM and soft hyphen are removed.
assert.strictEqual(S('a\u200Bb\u2060c\uFEFFd\u00ADe'), 'abcde')
// ZWNJ and ZWJ are legitimate and must survive.
assert.strictEqual(S('x\u200Cy\u200Dz'), 'x\u200Cy\u200Dz')
// Bidi controls are removed (display-spoofing).
assert.strictEqual(S('a\u202Eb\u2066c\u2069d\u061C'), 'abcd')
// A lone surrogate becomes U+FFFD rather than reaching a UTF-8 sink.
assert.strictEqual(S('a\uD800b'), 'a\uFFFDb')
assert.strictEqual(S('a\uDFFFb'), 'a\uFFFDb')

// NFKC folds display names; a zero-width space must not block composition.
const zwspThenMark = 'a\u200B\u0301'
assert.strictEqual(S(zwspThenMark), '\u00E1')
assert.strictEqual(S(S(zwspThenMark)), S(zwspThenMark), 'not idempotent after NFKC')
assert.strictEqual(S('\uFF21\uFF22\uFF23'), 'ABC')

// The cap counts code points and never splits a surrogate pair.
assert.strictEqual(S('a'.repeat(MAX_INBOUND_STRING_LENGTH + 50)).length, MAX_INBOUND_STRING_LENGTH)
const capped = S('\u{1F600}'.repeat(MAX_INBOUND_STRING_LENGTH + 50))
assert.strictEqual(Array.from(capped).length, MAX_INBOUND_STRING_LENGTH)
assert.ok(!capped.includes('\uFFFD'), 'cap split a surrogate pair')

// A run of line-break characters folds to a single space.
assert.strictEqual(S('\r\n\t\u2028'), ' ')

/* ------------------------------------------------------------ structure */

// Non-finite numbers are not JSON-safe, so they become null.
assert.strictEqual(sanitizeInbound(NaN), null)
assert.strictEqual(sanitizeInbound(Infinity), null)
assert.strictEqual(sanitizeInbound(-Infinity), null)
assert.strictEqual(sanitizeInbound(0), 0)
assert.strictEqual(sanitizeInbound(null), null)
assert.strictEqual(sanitizeInbound(true), true)

// Plain objects and arrays are rebuilt with sanitized leaves.
assert.deepStrictEqual(
  sanitizeInbound({ a: 'x\u200By', b: ['z\r\nw', 7] }),
  { a: 'xy', b: ['z w', 7] }
)

// A date and a Buffer pass straight through (identity, not copied).
const date = new Date('2024-01-01T00:00:00Z')
const buf = Buffer.from('abc')
assert.strictEqual(sanitizeInbound(date), date)
assert.strictEqual(sanitizeInbound(buf), buf)

// Own __proto__/constructor/prototype keys are dropped, so a raw payload cannot
// pollute a prototype. JSON.parse is used because an object literal cannot make
// an own __proto__ key.
const hostile = JSON.parse('{"__proto__":{"polluted":true},"constructor":"c","prototype":"p","ok":"a\\u200Bb"}')
const clean = sanitizeInbound(hostile)
assert.deepStrictEqual(clean, { ok: 'ab' })
assert.strictEqual(Object.getPrototypeOf(clean), Object.prototype)
assert.strictEqual({}.polluted, undefined)

// The input is never mutated.
const frozen = Object.freeze({
  text: Object.freeze('a\u200Bb'),
  list: Object.freeze([Object.freeze('c\u2028d')]),
})
assert.deepStrictEqual(sanitizeInbound(frozen), { text: 'ab', list: ['c d'] })

// Depth is bounded: anything past MAX_INBOUND_DEPTH is emptied, not walked.
let deep = {}
let cursor = deep
for (let i = 0; i < MAX_INBOUND_DEPTH + 5; i++) {
  cursor.next = {}
  cursor = cursor.next
}
cursor.value = 'deep\u200Bvalue'
assert.ok(!JSON.stringify(sanitizeInbound(deep)).includes('deep'), 'depth bound not enforced')

// A cycle neither hangs nor throws.
const cyclic = { name: 'a\u200Bb' }
cyclic.self = cyclic
const cyclicOut = sanitizeInbound(cyclic)
assert.strictEqual(cyclicOut.name, 'ab')
assert.strictEqual(cyclicOut.self, undefined)

// Already-plain output stays plain.
function isPlainObject(value) {
  const proto = Object.getPrototypeOf(value)
  return proto === null || proto === Object.prototype
}
for (const value of [sanitizeInbound(hostile), sanitizeInbound({ a: [1, { b: 2 }] })]) {
  assert.ok(isPlainObject(value), 'sanitizeInbound returned a non-plain object')
}

/* --------------------------------------------------------------- escape */

// Unknown/absent config values fall back to none, so old flows keep working.
assert.strictEqual(normalizeEscapeMode(undefined), 'none')
assert.strictEqual(normalizeEscapeMode(''), 'none')
assert.strictEqual(normalizeEscapeMode('HTML'), 'html')
assert.strictEqual(normalizeEscapeMode('bogus'), 'none')
assert.strictEqual(escapeText('plain', 'none'), 'plain')

// html: text and quoted-attribute characters, nothing else.
assert.strictEqual(escapeText(`<script>&"'`, 'html'), '&lt;script&gt;&amp;&quot;&#39;')

// Escape runs after NFKC: a fullwidth < folds to < only after normalization,
// so escaping first would let it through as a raw <.
assert.strictEqual(S('\uFF1C'), '<')
assert.strictEqual(escapeText(S('\uFF1C'), 'html'), '&lt;')

// js: string-literal escapes, plus $ so ${} cannot interpolate in a template
// literal, plus < > & so a value cannot close a <script>.
assert.strictEqual(escapeText('a\\b', 'js'), 'a\\\\b')
assert.strictEqual(escapeText("a'b\"c`d", 'js'), "a\\'b\\\"c\\`d")
assert.strictEqual(escapeText('$x', 'js'), '\\u0024x')
assert.strictEqual(escapeText('</script>', 'js'), '\\u003C/script\\u003E')
assert.strictEqual(escapeText('a\nb', 'js'), 'a\\u000Ab')
assert.strictEqual(escapeText('a\u2028b', 'js'), 'a\\u2028b')

// shell: single-quote wrap; a quote becomes the POSIX '\'' sequence.
assert.strictEqual(escapeText('hello world', 'shell'), "'hello world'")
assert.strictEqual(escapeText("'; rm -rf /", 'shell'), "''\\''; rm -rf /'")

// Applied exactly once, not as escape(escape(x)): escaping is not idempotent.
const twice = escapeText(escapeText('a & b', 'html'), 'html')
assert.notStrictEqual(twice, escapeText('a & b', 'html'))
assert.strictEqual(twice, 'a &amp;amp; b')

// The cap is applied before escaping, so escaped output may exceed it.
const capThenEscape = escapeText(S('<'.repeat(MAX_INBOUND_STRING_LENGTH + 1)), 'html')
assert.strictEqual(capThenEscape.length, MAX_INBOUND_STRING_LENGTH * 4)

/* --------------------------------------------- seeded property loop */

function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ALPHABET = [
  'a', 'B', '7', ' ', '!', '/', '<', '>', '&',
  '\u200B', '\u200C', '\u200D', '\uFEFF', '\u2060', '\u00AD',
  '\u0301', '\u0308',
  '\u2028', '\u2029', '\u0085', '\r', '\n', '\t', '\u001B', '\u0007', '\u009F',
  '\uD800', '\uDFFF',
  '\u202E', '\u2066', '\u2069', '\u061C', '\u200E',
  '\uFF21', '\u{1F600}',
]

const random = mulberry32(0x5eed)
const pick = (list) => list[Math.floor(random() * list.length)]
const randomString = (length) => {
  let out = ''
  for (let i = 0; i < length; i++) out += pick(ALPHABET)
  return out
}
const randomValue = (depth) => {
  const roll = random()
  if (depth > 0 && roll < 0.25) {
    return Array.from({ length: 1 + Math.floor(random() * 3) }, () => randomValue(depth - 1))
  }
  if (depth > 0 && roll < 0.5) {
    const obj = {}
    const keys = ['k', '__proto__', 'constructor', 'prototype', 'x\u200B']
    for (let i = 0; i < 1 + Math.floor(random() * 3); i++) {
      // defineProperty, not obj[key] = ..., so an own "__proto__" key is created
      // instead of replacing the prototype (which would make it a class instance).
      Object.defineProperty(obj, pick(keys), {
        value: randomValue(depth - 1),
        enumerable: true,
        configurable: true,
        writable: true,
      })
    }
    return obj
  }
  if (roll < 0.6) return random() * 1e9
  if (roll < 0.65) return null
  if (roll < 0.7) return random() < 0.5
  return randomString(1 + Math.floor(random() * 40))
}

const CONTROL = /[\u0000-\u0008\u000E-\u001F\u007F-\u009F\u2028\u2029\u0085\r\n]/
const BIDI = /[\u202A-\u202E\u2066-\u2069\u061C\u200E\u200F]/

for (let i = 0; i < 3000; i++) {
  const value = randomValue(3)
  const once = sanitizeInbound(value)
  const twice = sanitizeInbound(once)
  assert.deepStrictEqual(twice, once, `not idempotent at iteration ${i}`)

  const stack = [once]
  while (stack.length) {
    const current = stack.pop()
    if (typeof current === 'string') {
      assert.ok(!CONTROL.test(current), `control char survived: ${JSON.stringify(current)}`)
      assert.ok(!BIDI.test(current), `bidi control survived: ${JSON.stringify(current)}`)
      assert.ok(Array.from(current).length <= MAX_INBOUND_STRING_LENGTH, 'string over cap')
    } else if (Array.isArray(current)) {
      for (const item of current) stack.push(item)
    } else if (current && typeof current === 'object' && !(current instanceof Date)) {
      for (const key of Object.keys(current)) stack.push(current[key])
    }
  }
}

console.log('sanitize-inbound test: ok')
