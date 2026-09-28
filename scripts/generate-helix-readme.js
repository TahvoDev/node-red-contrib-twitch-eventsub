#!/usr/bin/env node
'use strict'

/**
 * Regenerates the Helix node catalogue in README.md from the compiled specs, so
 * the docs cannot drift from the palette. Writes by default; `--check` fails if
 * the committed README is out of date.
 */

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const { HELIX_SPECS } = require(path.join(root, 'dist', 'twitch', 'helix', 'specs', 'index.js'))
const { specScopes, specTier, actionNames } = require(path.join(root, 'dist', 'twitch', 'helix', 'define.js'))

const START = '<!-- helix-nodes:start -->'
const END = '<!-- helix-nodes:end -->'
const check = process.argv.includes('--check')

const rows = HELIX_SPECS.map((spec) => {
  const scopes = specScopes(spec)
  const scopeText = scopes.length ? scopes.map((scope) => `\`${scope}\``).join(', ') : '—'
  const actions = spec.actions
    ? Object.keys(spec.actions).map((name) => `\`${name}\``).join(', ')
    : '—'
  const label = spec.palette === false ? `${spec.label} *(hidden)*` : spec.label
  return `| ${label} | ${actions} | ${specTier(spec)} | ${scopeText} |`
})

const table = ['| Node | Actions | Tier | Scopes |', '| --- | --- | --- | --- |', ...rows].join('\n')

const readmePath = path.join(root, 'README.md')
const readme = fs.readFileSync(readmePath, 'utf8')
const start = readme.indexOf(START)
const end = readme.indexOf(END)

if (start < 0 || end < 0) {
  console.error(`README.md is missing the ${START} / ${END} markers`)
  process.exit(1)
}

const next = `${readme.slice(0, start + START.length)}\n${table}\n${readme.slice(end)}`

if (check) {
  if (next !== readme) {
    console.error('README.md Helix catalogue is out of date; run `npm run sync` or `npm run build`')
    process.exit(1)
  }
  console.log(`README Helix catalogue is up to date (${HELIX_SPECS.length} nodes)`)
  process.exit(0)
}

fs.writeFileSync(readmePath, next)
console.log(`README Helix catalogue updated (${HELIX_SPECS.length} nodes)`)
