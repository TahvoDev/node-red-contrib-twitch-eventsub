#!/usr/bin/env node
'use strict'

/**
 * End-to-end test for the Twitch Chat nodes.
 *
 * The nodes are pointed at a self-hosted fdgt mock (https://fdgt.dev) instead of
 * Twitch, so the whole chat path runs without a Twitch account and without
 * leaning on the fdgt project's hosted servers: the package is installed into a
 * real Node-RED container, a second container runs a pinned fdgt build in the
 * same network namespace, and the flow drives the nodes over HTTP. fdgt turns a
 * message like `bits --username e2e-user !hello` sent by the node into a
 * simulated event delivered back on the same connection, which exercises chat
 * send, chat in and the command filter together.
 *
 * Twitch's own CLI has no chat/IRC mock (its event websocket only speaks
 * EventSub), so fdgt is used for the IRC half. Moderation nodes use the Helix
 * API and are not covered here.
 *
 * Usage:
 *   npm run test:e2e:chat
 *
 * Environment:
 *   CONTAINER_ENGINE  podman (default) or docker
 *   E2E_PORT          host port to publish Node-RED on (default 1880)
 *   E2E_KEEP=1        leave the containers and data dir in place (for the demo)
 *   E2E_NR_IMAGE      override the Node-RED image
 *   E2E_CHAT_HOST     point the chat nodes somewhere other than the local fdgt
 *                     (e.g. irc.fdgt.dev to use the hosted mock)
 */

const { spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const root = path.resolve(__dirname, '..', '..')
const packageName = require(path.join(root, 'package.json')).name
const flowTemplate = path.join(root, 'examples', 'mock-chat-nodes.json')

const NR_IMAGE = process.env.E2E_NR_IMAGE || 'docker.io/nodered/node-red:latest'
const FDGT_IMAGE = process.env.E2E_FDGT_IMAGE || 'localhost/twitch-chat-e2e-fdgt:a74e56e'
const NR_CONTAINER = 'twitch-chat-e2e-nr'
const FDGT_CONTAINER = 'twitch-chat-e2e-fdgt'
const PORT = process.env.E2E_PORT || '1880'
const KEEP = process.env.E2E_KEEP === '1'
// The sidecar shares Node-RED's network namespace, so 127.0.0.1 reaches it.
const CHAT_HOST = process.env.E2E_CHAT_HOST || '127.0.0.1'

const CHANNEL = `nre2e${Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(2, 8)}`

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
        const value = await check()
        if (value) return value
        await sleep(delay)
    }
    throw new Error(`timed out waiting for ${label}`)
}

function imageExists(tag) {
    return spawnSync(engine, ['image', 'exists', tag], { stdio: 'ignore' }).status === 0
}

function ensurePulled(tag) {
    if (imageExists(tag)) return
    console.log(`==> pulling ${tag}`)
    run(engine, ['pull', tag])
}

function ensureImage(tag, dockerfile) {
    if (imageExists(tag)) return
    console.log(`==> building ${tag} (first run only)`)
    run(engine, ['build', '-t', tag, '-f', dockerfile, __dirname])
}

function removeContainers() {
    // The fdgt sidecar shares Node-RED's netns, so it has to go first.
    spawnSync(engine, ['rm', '-f', FDGT_CONTAINER], { stdio: 'ignore' })
    spawnSync(engine, ['rm', '-f', NR_CONTAINER], { stdio: 'ignore' })
}

function readLog(file) {
    try {
        return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
    } catch {
        return []
    }
}

function prepareData(tmpDir) {
    const nrDir = path.join(tmpDir, 'nr')
    fs.mkdirSync(nrDir, { recursive: true })

    const packed = capture('npm', ['pack', '--ignore-scripts', '--pack-destination', tmpDir], { cwd: root })
    const tarball = path.join(tmpDir, packed.split('\n').pop().trim())
    fs.copyFileSync(tarball, path.join(nrDir, 'pkg.tgz'))

    fs.writeFileSync(
        path.join(nrDir, 'package.json'),
        `${JSON.stringify({ name: 'twitch-chat-e2e', private: true, dependencies: { [packageName]: 'file:./pkg.tgz' } }, null, 2)}\n`
    )

    const flow = fs
        .readFileSync(flowTemplate, 'utf8')
        .split('__CHANNEL__').join(CHANNEL)
        .split('irc.fdgt.dev').join(CHAT_HOST)
    fs.writeFileSync(path.join(nrDir, 'flows.json'), flow)

    console.log('==> installing the package into the test Node-RED data dir')
    run(engine, [
        'run', '--rm', ...userns,
        '-v', volume(nrDir, '/data'),
        '-w', '/data',
        '--entrypoint', 'npm',
        NR_IMAGE,
        'install', '--no-audit', '--no-fund', '--loglevel=error',
    ])

    return { nrDir }
}

function startNodeRed(nrDir) {
    console.log(`==> starting Node-RED on host port ${PORT} (fdgt channel #${CHANNEL})`)
    run(engine, [
        'run', '-d', '--name', NR_CONTAINER, ...userns,
        '-p', `${PORT}:1880`,
        '-v', volume(nrDir, '/data'),
        NR_IMAGE,
    ])

    console.log('==> starting the self-hosted fdgt mock in the same netns')
    run(engine, [
        'run', '-d', '--name', FDGT_CONTAINER, ...userns,
        '--network', `container:${NR_CONTAINER}`,
        FDGT_IMAGE,
    ])
}

async function post(route, body) {
    const res = await fetch(`http://127.0.0.1:${PORT}${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`POST ${route} -> ${res.status}`)
    return res
}

async function main() {
    if (!engine) {
        console.error('test:e2e:chat needs podman or docker on PATH (set CONTAINER_ENGINE to choose).')
        process.exit(1)
    }

    console.log('==> building the package')
    run('npm', ['run', 'build'], { cwd: root })
    ensurePulled(NR_IMAGE)
    ensureImage(FDGT_IMAGE, path.join(__dirname, 'Dockerfile.fdgt'))

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twitch-chat-e2e-'))
    console.log(`==> temp data ${tmpDir}`)

    const { nrDir } = prepareData(tmpDir)
    removeContainers()
    startNodeRed(nrDir)

    const chatLog = path.join(nrDir, 'chat-e2e.log')
    const commandLog = path.join(nrDir, 'chat-command-e2e.log')

    try {
        console.log('==> driving chat send; fdgt echoes a simulated event back')
        const message = await waitFor(async () => {
            await post('/e2e/send', { text: 'bits --bitscount 7 --username e2e-user !hello' }).catch(() => {})
            await sleep(1500)
            return readLog(chatLog).find((entry) => entry.user === 'e2e-user')
        }, { tries: 20, delay: 1000, label: 'chat in to receive a simulated fdgt event' })

        console.log(`==> chat in received: ${JSON.stringify(message)}`)
        if (!message.isCheer || message.bits !== 7) {
            throw new Error(`unexpected chat message: ${JSON.stringify(message)}`)
        }

        const command = await waitFor(() => Promise.resolve(readLog(commandLog).find((entry) => entry.command === 'hello')), {
            tries: 10,
            delay: 1000,
            label: 'chat command to match !hello',
        })
        console.log(`==> chat command matched: ${JSON.stringify(command)}`)
        if (!Array.isArray(command.args) || command.args.length === 0) {
            throw new Error(`command args were not parsed: ${JSON.stringify(command)}`)
        }

        console.log('==> triggering chat join/part')
        await post('/e2e/join', { channel: CHANNEL })
        await post('/e2e/part', { channel: CHANNEL })

        console.log('\n==> Chat E2E passed')
    } finally {
        if (KEEP) {
            console.log(`==> E2E_KEEP=1: leaving ${NR_CONTAINER} + ${FDGT_CONTAINER} running (http://localhost:${PORT}) and ${tmpDir}`)
        } else {
            removeContainers()
            fs.rmSync(tmpDir, { recursive: true, force: true })
        }
    }
}

main().catch((error) => {
    console.error(`\nChat E2E failed: ${error.message}`)
    process.exit(1)
})
