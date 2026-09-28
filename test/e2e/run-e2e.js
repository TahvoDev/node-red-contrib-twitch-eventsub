#!/usr/bin/env node
'use strict'

/**
 * End-to-end test: runs the built package inside a real Node-RED container
 * against the Twitch CLI EventSub mock, fires every event the CLI can generate
 * and asserts Node-RED consumed them.
 *
 * This is the only part of the tooling that needs a container engine. It is
 * deliberately kept out of `npm install` / `npm run build` / `npm run check`, so
 * the module still builds and installs on machines without podman or docker.
 *
 * Usage:
 *   npm run test:e2e
 *
 * Environment:
 *   CONTAINER_ENGINE   podman (default) or docker
 *   E2E_KEEP=1         leave the temp data and containers in place for debugging
 *   E2E_DELAY          ms between fired events (default 150)
 *   E2E_FLOW           flow file to deploy (default: built from the EventSub registry)
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
let flowPath = process.env.E2E_FLOW || null

const NR_IMAGE = process.env.E2E_NR_IMAGE || 'docker.io/nodered/node-red:latest'
const CLI_IMAGE = process.env.E2E_CLI_IMAGE || 'localhost/twitch-e2e-cli:1.1.24'
const PROXY_IMAGE = process.env.E2E_PROXY_IMAGE || 'localhost/twitch-e2e-proxy:latest'

const NR_CONTAINER = 'twitch-e2e-nr'
const API_CONTAINER = 'twitch-e2e-api'
const WS_CONTAINER = 'twitch-e2e-ws'
const PROXY_CONTAINER = 'twitch-e2e-proxy'

const MOCK_USER_ID = process.env.E2E_MOCK_USER_ID || '3963854'
// The flow leaves twitch_client_id empty in mock mode, so the runtime falls back
// to this exact id.
const MOCK_CLIENT_ID = process.env.E2E_MOCK_CLIENT_ID || 'mock-client-id'
// The Twitch CLI checks GitHub for a newer release on every command and panics
// when that unauthenticated request is rate-limited or offline. Pointing its HTTP
// client at a dead loopback proxy makes the check fail fast; loopback (the mock
// endpoints) is never proxied, so the CLI still reaches the mock.
const CLI_UPDATE_CHECK_BLOCK = ['-e', 'HTTP_PROXY=http://127.0.0.1:9', '-e', 'HTTPS_PROXY=http://127.0.0.1:9']
const DELAY = process.env.E2E_DELAY || '150'
const KEEP = process.env.E2E_KEEP === '1'

const engine = process.env.CONTAINER_ENGINE || ['podman', 'docker'].find(hasEngine)
const isPodman = engine === 'podman'
const userns = isPodman ? ['--userns=keep-id'] : []
const volume = (host, dest) => `${host}:${dest}${isPodman ? ':Z' : ''}`

function hasEngine(candidate) {
    return spawnSync(candidate, ['--version'], { stdio: 'ignore' }).status === 0
}

function run(cmd, args, options = {}) {
    const result = spawnSync(cmd, args, { stdio: 'inherit', ...options })
    if (result.status !== 0) {
        throw new Error(`${cmd} ${args.join(' ')} failed with exit code ${result.status}`)
    }
    return result
}

function capture(cmd, args, options = {}) {
    const result = spawnSync(cmd, args, { encoding: 'utf8', ...options })
    if (result.status !== 0) {
        throw new Error(`${cmd} ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`)
    }
    return (result.stdout || '').trim()
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(check, { tries, delay, label }) {
    for (let attempt = 1; attempt <= tries; attempt++) {
        if (check()) return
        await sleep(delay)
    }
    throw new Error(`timed out waiting for ${label}`)
}

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
    // Sidecars share Node-RED's netns, so stop them before Node-RED.
    for (const name of [PROXY_CONTAINER, WS_CONTAINER, API_CONTAINER, NR_CONTAINER]) {
        spawnSync(engine, ['rm', '-f', name], { stdio: 'ignore' })
    }
}

function nrExec(script) {
    return capture(engine, ['exec', NR_CONTAINER, 'node', '-e', script])
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
        `${JSON.stringify({ name: 'twitch-e2e', private: true, dependencies: { [packageName]: 'file:./pkg.tgz' } }, null, 2)}\n`
    )
    fs.copyFileSync(flowPath, path.join(nrDir, 'flows.json'))

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

function startContainers({ nrDir, mockDir }) {
    console.log('==> starting Node-RED and the Twitch CLI mock')
    run(engine, ['run', '-d', '--name', NR_CONTAINER, ...userns, '-v', volume(nrDir, '/data'), NR_IMAGE])

    const sidecar = (name, image, args) =>
        run(engine, [
            'run', '-d', '--name', name, ...userns,
            '--network', `container:${NR_CONTAINER}`,
            ...CLI_UPDATE_CHECK_BLOCK,
            '-v', volume(mockDir, '/data'),
            image, ...args,
        ])

    sidecar(API_CONTAINER, CLI_IMAGE, ['mock-api', 'start', '-p', '8081'])
    sidecar(WS_CONTAINER, CLI_IMAGE, ['event', 'websocket', 'start-server', '-p', '8082', '-S'])
    run(engine, [
        'run', '-d', '--name', PROXY_CONTAINER, ...userns,
        '--network', `container:${NR_CONTAINER}`,
        PROXY_IMAGE,
    ])
}

function liveSubscriptionCount() {
    try {
        const count = nrExec(
            `fetch('http://127.0.0.1:8080/eventsub/subscriptions',{headers:{'Client-Id':${JSON.stringify(MOCK_CLIENT_ID)}}})` +
                '.then(r=>r.json()).then(j=>process.stdout.write(String((j.data||[]).length))).catch(()=>process.exit(1))'
        )
        return Number(count) || 0
    } catch {
        return 0
    }
}

async function main() {
    if (!engine) {
        console.error('test:e2e needs podman or docker on PATH (set CONTAINER_ENGINE to choose).')
        console.error('The module itself does not: npm install / npm run build work without one.')
        process.exit(1)
    }
    if (process.env.E2E_FLOW && !fs.existsSync(flowPath)) {
        throw new Error(`flow not found: ${flowPath}`)
    }

    console.log('==> building the package')
    run('npm', ['run', 'build'], { cwd: root })

    ensurePulled(NR_IMAGE)
    ensureImage(CLI_IMAGE, path.join(__dirname, 'Dockerfile.cli'))
    ensureImage(PROXY_IMAGE, path.join(__dirname, 'Dockerfile.proxy'))

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twitch-e2e-'))
    console.log(`==> temp data ${tmpDir}`)

    // No E2E_FLOW: build the mock flow from the registry so it tracks the single
    // twitch-eventsub node automatically.
    if (!flowPath) {
        flowPath = path.join(tmpDir, 'flows.json')
        require('./make-flow').writeMockFlow(flowPath)
    }
    console.log(`==> engine ${engine}, flow ${flowPath}`)

    try {
        const data = prepareData(tmpDir)
        removeContainers()
        startContainers(data)
        await waitFor(() => liveSubscriptionCount() > 0, {
            tries: 60,
            delay: 2000,
            label: 'Node-RED to authenticate and subscribe against the mock',
        })
        // A few topics are refused by the CLI mock; give that burst a moment to settle.
        await sleep(3000)

        const subscriptions = liveSubscriptionCount()
        console.log(`==> Node-RED holds ${subscriptions} mock subscriptions`)

        console.log('==> firing events through the Twitch CLI mock')
        run(process.execPath, [
            path.join(__dirname, 'fire-all-events.js'),
            '--flow', flowPath,
            '--user', MOCK_USER_ID,
            '--client-id', MOCK_CLIENT_ID,
            '--nr-container', NR_CONTAINER,
            '--ws-container', WS_CONTAINER,
            '--delay', DELAY,
            '--strict',
        ])

        console.log('\n==> E2E passed')
    } finally {
        if (KEEP) {
            console.log(`==> E2E_KEEP=1: leaving containers (${NR_CONTAINER}, ${API_CONTAINER}, ${WS_CONTAINER}, ${PROXY_CONTAINER}) and ${tmpDir}`)
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
