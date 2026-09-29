#!/usr/bin/env node
'use strict'

/**
 * Static sink check. ESLint cannot see the editor HTML or the intent behind a
 * fetch call, so this scans src/ for the patterns the security work removed and
 * that must not come back:
 *
 *   - Object.assign / spread of external data onto a message
 *   - jQuery `.html()` / innerHTML / document.write (dynamic HTML)
 *   - string-built HTML appended to the DOM (`.append('<...')`)
 *   - eval / new Function / child_process
 *   - fetch with a string literal (URLs go through buildUrl)
 *   - `"https://" +` style URL concatenation
 *
 * It strips comments before matching, so explanatory prose is not a false hit.
 */

const fs = require('fs')
const path = require('path')

const SRC = path.resolve(__dirname, '..', 'src')

// Only block comments and whole-line `//` comments are removed; stripping inline
// `//` would eat the `//` inside string literals (e.g. in a URL).
function stripTsComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function stripHtmlComments(code) {
  return code.replace(/<!--[\s\S]*?-->/g, '')
}

const RULES = [
  { name: 'Object.assign on a message', re: /\bObject\.assign\s*\(/ },
  { name: 'dynamic .html()', re: /\.html\s*\(/ },
  { name: 'innerHTML / document.write', re: /\b(innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b/ },
  { name: 'string-built HTML append', re: /\.append\(\s*['"]</ },
  { name: 'eval', re: /\beval\s*\(/ },
  { name: 'new Function', re: /\bnew\s+Function\s*\(/ },
  { name: 'child_process', re: /child_process|require\(\s*['"]child_process/ },
  { name: 'fetch with a string literal URL', re: /\bfetch\s*\(\s*['"`]/ },
  { name: 'URL string concatenation', re: /(['"`])https?:\/\/[^'"`]*\1\s*\+|\+\s*(['"`])https?:\/\// },
]

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return files(full)
    return entry.name.endsWith('.ts') || entry.name.endsWith('.html') ? [full] : []
  })
}

const failures = []
for (const file of files(SRC)) {
  const raw = fs.readFileSync(file, 'utf8')
  const isHtml = file.endsWith('.html')
  const code = isHtml ? stripHtmlComments(raw) : stripTsComments(raw)
  const lines = code.split('\n')
  for (const rule of RULES) {
    lines.forEach((line, index) => {
      if (rule.re.test(line)) {
        failures.push(`${path.relative(path.resolve(__dirname, '..'), file)}:${index + 1}  ${rule.name}`)
      }
    })
  }
}

if (failures.length) {
  console.error(`forbidden patterns found in ${failures.length} place(s):`)
  for (const failure of failures) console.error(`  ${failure}`)
  console.error('\nroute external strings through src/security/ and build URLs with buildUrl()')
  process.exit(1)
}

console.log('forbidden-pattern check: clean')
