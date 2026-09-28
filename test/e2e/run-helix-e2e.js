#!/usr/bin/env node
'use strict'

/**
 * End-to-end test for the Helix nodes: runs the built package inside a real
 * Node-RED container against the Twitch CLI mock API, deploys a flow with one
 * inject fanning out to the generated nodes, and asserts the mock actually
 * received the request each node is supposed to make.
 *
 * This is the Helix counterpart to run-e2e.js (EventSub). It is the only other
 * part of the tooling that needs a container engine, and is kept out of
 * `npm install` / `npm run build` / `npm run check`.
 *
 * The Twitch CLI mock API generates a random client id, access token and user
 * on every start and 401s anything else, so the runner reads them from the mock
 * log and feeds them to the config node in mock mode.
 *
 * Usage:
 *   npm run test:e2e:helix
 *
 * Environment:
 *   CONTAINER_ENGINE   podman (default) or docker
 *   E2E_KEEP=1         leave the temp data and containers in place for debugging
 *   E2E_NR_IMAGE       override the Node-RED image
 *   E2E_CLI_IMAGE      override the Twitch CLI mock image
 *   E2E_PROXY_IMAGE    override the mock proxy image
 */

const { spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const root = path.resolve(__dirname, '..', '..')
const packageName = require(path.join(root, 'package.json')).name

const NR_IMAGE = process.env.E2E_NR_IMAGE || 'docker.io/nodered/node-red:latest'
const CLI_IMAGE = process.env.E2E_CLI_IMAGE || 'localhost/twitch-e2e-cli:1.1.24'
const PROXY_IMAGE = process.env.E2E_PROXY_IMAGE || 'localhost/twitch-e2e-proxy:latest'

const NR_CONTAINER = 'twitch-helix-e2e-nr'
const API_CONTAINER = 'twitch-helix-e2e-api'
const PROXY_CONTAINER = 'twitch-helix-e2e-proxy'

const MOCK_PORT = 8080
const TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS || 120000)
const KEEP = process.env.E2E_KEEP === '1'

// Each case is one generated node and the request it must make. `fields` are
// merged straight into the node config (including `action` for action nodes).
const CASES = [
    { type: 'twitch-helix-get-users', method: 'GET', path: '/mock/users' },
    { type: 'twitch-helix-get-streams', method: 'GET', path: '/mock/streams' },
    { type: 'twitch-helix-get-channel-info', method: 'GET', path: '/mock/channels' },
    { type: 'twitch-helix-get-followers', method: 'GET', path: '/mock/channels/followers' },
    { type: 'twitch-helix-bans', fields: { action: 'list' }, method: 'GET', path: '/mock/moderation/banned' },
    { type: 'twitch-helix-moderators', fields: { action: 'list' }, method: 'GET', path: '/mock/moderation/moderators' },
    { type: 'twitch-helix-videos', fields: { action: 'list' }, method: 'GET', path: '/mock/videos' },
    { type: 'twitch-helix-clips', fields: { action: 'list' }, method: 'GET', path: '/mock/clips' },
    { type: 'twitch-helix-bits', fields: { action: 'leaderboard' }, method: 'GET', path: '/mock/bits/leaderboard' },
    { type: 'twitch-helix-send-chat-message', fields: { message: 'e2e hello' }, method: 'POST', path: '/mock/chat/messages' },
    // The generic node reaches a hidden spec through the same pipeline.
    { type: 'twitch-helix-api-request', fields: { endpoint: 'twitch-helix-chat-badges' }, method: 'GET', path: '/mock/chat/badges' },
]

const engine = process.env.CONTAINER_ENGINE || ['podman', 'docker'].find(hasEngine)
const isPodman = engine === 'podman'
const userns = isPodman ? ['--userns=keep-id'] : []
const volume = (host, dest) => `${host}:${dest}${isPodman ? ':Z' : ''}`

function hasEngine(candidate) {
    return spawnSync(candidate, ['--version'], { stdio: 'ignore' }).status === 0
}

function run(cmd, args, options = {}) {
    const result = spawnSync(cmd, args, { stdio: 'inherit', ...options })
    if (result.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed with exit code ${result.status}`)
    return result
}

function capture(cmd, args, options = {}) {
    const result = spawnSync(cmd, args, { encoding: 'utf8', ...options })
    if (result.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`)
    return (result.stdout || '').trim()
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function imageExists(tag) {
    return spawnSync(engine, ['image', 'exists', tag], { stdio: 'ignore' }).status === 0
}

function ensureImage(tag, dockerfile) {
    if (imageExists(tag)) return
    console.log(`==> building ${tag} (first run only)`)
    run(engine, ['build', '-t', tag, '-f', dockerfile, __dirname])
}

function ensurePulled(tag) {
    if (imageExists(tag)) return
    console.log(`==> pulling ${tag}`)
    run(engine, ['pull', tag])
}

function removeContainers() {
    // Everything shares the mock API's netns, so stop the mock last.
    for (const name of [NR_CONTAINER, PROXY_CONTAINER, API_CONTAINER]) {
        spawnSync(engine, ['rm', '-f', name], { stdio: 'ignore' })
    }
}

function containerLogs(name) {
    const result = spawnSync(engine, ['logs', name], { encoding: 'utf8' })
    return `${result.stdout || ''}\n${result.stderr || ''}`
}

/** The mock generates credentials at startup; read them from its log. */
function mockCredentials() {
    const log = containerLogs(API_CONTAINER)
    const clientId = /Client-ID:\s*([0-9a-f]+)/.exec(log)
    const token = /Created authorization with token\s+(\w+)/.exec(log)
    const userId = /User ID (\d+) has all applicable/.exec(log)
    if (!clientId || !token || !userId) return null
    return { clientId: clientId[1], token: token[1], userId: userId[1] }
}

/** The flow: one once-inject fans out to every case, each into a debug node. */
function buildFlow(credentials) {
    const tab = 'helix-e2e-tab'
    const configId = 'helix-e2e-config'
    const injectId = 'helix-e2e-inject'
    const nodes = [
        { id: tab, type: 'tab', label: 'helix e2e' },
        {
            id: configId, type: 'twitch-api-config', z: tab, name: 'mock',
            twitch_client_id: credentials.clientId,
            twitch_user_id: '', twitch_user_login: '',
            twitch_mock_server_port: String(MOCK_PORT),
            twitch_mock_user_id: credentials.userId,
            twitch_mock_token: credentials.token,
            x: 120, y: 100, wires: [],
        },
    ]

    // One inject per node, so a failure in one cannot hide the others.
    CASES.forEach((_, index) => {
        nodes.push({
            id: `${injectId}-${index}`, type: 'inject', z: tab, name: `go ${index}`,
            props: [], repeat: '', crontab: '', once: true, onceDelay: 2 + index * 0.1,
            topic: '', payload: '', payloadType: 'date',
            x: 120, y: 180 + index * 30, wires: [[`helix-e2e-node-${index}`]],
        })
    })
    // Catch uncaught/any node error and log it so a silent failure is visible.
    nodes.push({
        id: 'helix-e2e-catch', type: 'catch', z: tab, name: 'catch', scope: null,
        uncaught: false, wires: [['helix-e2e-catch-debug']],
    })
    nodes.push({
        id: 'helix-e2e-catch-debug', type: 'debug', z: tab, name: 'catch', active: true,
        tosidebar: true, console: true, complete: 'error.message', targetType: 'msg',
        statusVal: '', x: 700, y: 900, wires: [],
    })

    CASES.forEach((testCase, index) => {
        const fields = { ...(testCase.fields || {}) }
        if (testCase.type === 'twitch-helix-get-users') fields.userIds = credentials.userId

        const id = `helix-e2e-node-${index}`
        const debugId = `helix-e2e-debug-${index}`
        nodes.push({
            id, type: testCase.type, z: tab, name: testCase.type, config: configId,
            ...fields, x: 380, y: 100 + index * 60, wires: [[debugId]],
        })
        nodes.push({
            id: debugId, type: 'debug', z: tab, name: `${testCase.type} out`, active: true,
            tosidebar: true, console: false, complete: 'payload', targetType: 'msg',
            statusVal: 'payload', x: 700, y: 100 + index * 60, wires: [],
        })
    })

    return nodes
}

function prepareData(tmpDir) {
    const nrDir = path.join(tmpDir, 'nr')
    const mockDir = path.join(tmpDir, 'mock')
    fs.mkdirSync(nrDir, { recursive: true })
    fs.mkdirSync(mockDir, { recursive: true })

    const packed = capture('npm', ['pack', '--ignore-scripts', '--pack-destination', tmpDir], { cwd: root })
    const tarball = path.join(tmpDir, packed.split('\n').pop().trim())
    fs.copyFileSync(tarball, path.join(nrDir, 'pkg.tgz'))

    fs.writeFileSync(
        path.join(nrDir, 'package.json'),
        `${JSON.stringify({ name: 'twitch-helix-e2e', private: true, dependencies: { [packageName]: 'file:./pkg.tgz' } }, null, 2)}\n`
    )
    // Enable every tier so the flow's extended/advanced nodes register. A tier
    // that is not enabled is intentionally absent from the palette.
    fs.writeFileSync(
        path.join(nrDir, 'settings.js'),
        [
            'module.exports = {',
            "    flowFile: 'flows.json',",
            '    uiPort: process.env.PORT || 1880,',
            "    logging: { console: { level: 'info', metrics: false, audit: false } },",
            '    editorTheme: { projects: { enabled: false } },',
            "    twitchApi: { tiers: ['core', 'extended', 'advanced'] },",
            '};',
            '',
        ].join('\n')
    )

    console.log('==> installing the package into the test Node-RED data dir')
    run(engine, [
        'run', '--rm', ...userns,
        '-v', volume(nrDir, '/data'),
        '-w', '/data',
        '--entrypoint', 'npm',
        NR_IMAGE,
        'install', '--no-audit', '--no-fund', '--loglevel=error',
    ])

    return { nrDir, mockDir }
}

async function startContainers({ nrDir, mockDir }) {
    console.log('==> starting the Twitch CLI mock API')
    run(engine, [
        'run', '-d', '--name', API_CONTAINER, ...userns,
        '-v', volume(mockDir, '/data'),
        CLI_IMAGE, 'mock-api', 'start', '-p', '8081',
    ])

    let credentials = null
    const deadline = Date.now() + 30000
    while (Date.now() < deadline && !credentials) {
        await sleep(1000)
        credentials = mockCredentials()
    }
    if (!credentials) throw new Error('the mock API never printed its credentials')

    fs.writeFileSync(path.join(nrDir, 'flows.json'), `${JSON.stringify(buildFlow(credentials), null, 2)}\n`)

    // Node-RED and the proxy join the mock's netns so localhost:8080 is the proxy.
    console.log('==> starting Node-RED and the proxy')
    run(engine, ['run', '-d', '--name', NR_CONTAINER, ...userns, '--network', `container:${API_CONTAINER}`, '-v', volume(nrDir, '/data'), NR_IMAGE])
    run(engine, ['run', '-d', '--name', PROXY_CONTAINER, ...userns, '--network', `container:${API_CONTAINER}`, PROXY_IMAGE])
}

async function main() {
    if (!engine) {
        console.error('test:e2e:helix needs podman or docker on PATH (set CONTAINER_ENGINE to choose).')
        process.exit(1)
    }

    console.log(`==> engine ${engine}`)
    console.log('==> building the package')
    run('npm', ['run', 'build'], { cwd: root })

    ensurePulled(NR_IMAGE)
    ensureImage(CLI_IMAGE, path.join(__dirname, 'Dockerfile.cli'))
    ensureImage(PROXY_IMAGE, path.join(__dirname, 'Dockerfile.proxy'))

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twitch-helix-e2e-'))
    console.log(`==> temp data ${tmpDir}`)

    try {
        const data = prepareData(tmpDir)
        removeContainers()
        await startContainers(data)

        console.log('==> waiting for the nodes to fire through the mock')
        const deadline = Date.now() + TIMEOUT_MS
        let missing = CASES.map((testCase) => `${testCase.method} ${testCase.path}`)
        while (Date.now() < deadline && missing.length) {
            await sleep(2000)
            const logs = containerLogs(PROXY_CONTAINER)
            missing = CASES
                .map((testCase) => `${testCase.method} ${testCase.path}`)
                .filter((needle) => !logs.includes(needle))
        }

        if (missing.length) {
            console.error('==> proxy log:')
            console.error(containerLogs(PROXY_CONTAINER))
            console.error('==> mock API log (tail):')
            console.error(containerLogs(API_CONTAINER).split('\n').slice(-20).join('\n'))
            console.error('==> Node-RED log (tail):')
            console.error(containerLogs(NR_CONTAINER).split('\n').slice(-40).join('\n'))
            throw new Error(`the mock never received: ${missing.join(', ')}`)
        }

        const nrLog = containerLogs(NR_CONTAINER)
        const rawThrow = /TypeError|ReferenceError|UnhandledPromiseRejection|Uncaught/.exec(nrLog)
        if (rawThrow) throw new Error(`Node-RED logged a raw error: ${rawThrow[0]}`)

        console.log(`==> all ${CASES.length} Helix nodes reached the mock API`)
        console.log('\n==> E2E passed')
    } finally {
        if (KEEP) {
            console.log(`==> E2E_KEEP=1: leaving containers (${NR_CONTAINER}, ${API_CONTAINER}, ${PROXY_CONTAINER}) and ${tmpDir}`)
        } else {
            removeContainers()
            fs.rmSync(tmpDir, { recursive: true, force: true })
        }
    }
}

main().catch((error) => {
    console.error(`\nE2E failed: ${error.message}`)
    process.exit(1)
})
