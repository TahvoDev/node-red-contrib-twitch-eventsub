#!/usr/bin/env node
'use strict'

/**
 * Fires every EventSub event that the Twitch CLI can generate at the local Twitch CLI
 * EventSub WebSocket mock and reports what reached Node-RED.
 *
 * Two details of the mock are easy to get wrong and are handled here:
 *
 *   1. The mock only forwards events to clients that have a real subscription for them
 *      when the server runs with --require-subscription. Without it, the mock invents a
 *      subscription id and strict clients drop the notification.
 *   2. The subscription id in the notification has to be the one the client registered.
 *      A plain `twitch event trigger ... -T websocket` invents a new one, so each trigger
 *      targets the live session with --session and the subscription with -u.
 *
 * Verification works without any Node-RED credentials: the mock logs every delivery and
 * Node-RED logs every notification it refuses, so a fired event with no refusal and a
 * matching delivery line means the node consumed it. Set NODE_RED_TOKEN (or --token) to
 * additionally read the editor's debug sidebar for exact per-node confirmations.
 *
 * Usage:
 *   node scripts/mock/fire-all-events.js [options]
 *
 * Options:
 *   --node-red <url>     Node-RED base URL (default http://127.0.0.1:1880)
 *   --flow <path>        Flow file to read (default examples/mock-all-nodes.json)
 *   --user <id>          Mock broadcaster user id (default: from the flow)
 *   --client-id <id>     Client id the nodes registered with (default: from the flow)
 *   --nr-container <n>   Container running Node-RED (default twitch-nr)
 *   --ws-container <n>   Container running the websocket mock (default twitch-mock-ws)
 *   --delay <ms>         Time to wait after firing each event (default 700)
 *   --only <type,type>   Only fire these EventSub types
 *   --token <token>      Node-RED editor token for sidebar verification
 *   --no-verify          Only report what was fired
 *   --strict             Exit non-zero if the client rejected any notification
 */

const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const defaults = {
    nodeRed: 'http://127.0.0.1:1880',
    flow: path.join(__dirname, '..', '..', 'examples', 'mock-all-nodes.json'),
    nrContainer: 'twitch-nr',
    wsContainer: 'twitch-mock-ws',
    clientId: null,
    user: null,
    delay: 700,
    only: null,
    token: process.env.NODE_RED_TOKEN || null,
    verify: true,
    strict: false,
}

function parseArgs(argv) {
    const options = { ...defaults }
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        const next = () => argv[++i]
        if (arg === '--node-red') options.nodeRed = next()
        else if (arg === '--flow') options.flow = next()
        else if (arg === '--user') options.user = next()
        else if (arg === '--client-id') options.clientId = next()
        else if (arg === '--nr-container') options.nrContainer = next()
        else if (arg === '--ws-container') options.wsContainer = next()
        else if (arg === '--delay') options.delay = Number(next())
        else if (arg === '--only') options.only = next().split(',').map((t) => t.trim()).filter(Boolean)
        else if (arg === '--token') options.token = next()
        else if (arg === '--no-verify') options.verify = false
        else if (arg === '--strict') options.strict = true
        else {
            console.error(`Unknown option: ${arg}`)
            process.exit(2)
        }
    }
    return options
}

function loadFlow(flowPath) {
    const flow = JSON.parse(fs.readFileSync(flowPath, 'utf8'))
    const config = flow.find((n) => n.type === 'twitch-api-config') || {}
    const nodes = []
    for (const node of flow) {
        if (typeof node.type !== 'string' || !node.type.startsWith('twitch-eventsub-')) continue
        nodes.push({ name: node.name, id: node.id, debugId: (node.wires || []).flat()[0] })
    }
    return { config, nodes }
}

function podman(args, encoding = 'utf8') {
    return spawnSync('podman', args, { encoding })
}

/** Runs a snippet in the Node-RED container, which shares the mock network namespace. */
function inNodeRed(container, script) {
    const result = podman(['exec', container, 'node', '-e', script])
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim()
    if (result.status !== 0) throw new Error(`podman exec ${container} failed: ${output}`)
    return output
}

function listSubscriptions(options, clientId) {
    const raw = inNodeRed(
        options.nrContainer,
        `fetch('http://127.0.0.1:8080/eventsub/subscriptions',{headers:{'Client-Id':${JSON.stringify(clientId)}}})` +
            '.then(r=>r.json()).then(j=>process.stdout.write(JSON.stringify(j.data||[])))'
    )
    return JSON.parse(raw || '[]')
}

/**
 * A Node-RED redeploy reconnects the client, and the mock keeps the subscriptions of the
 * old session around, so the newest session is the only one whose events get delivered.
 */
function liveSessionSubscriptions(subscriptions) {
    const groups = new Map()
    for (const sub of subscriptions) {
        const session = sub.transport && sub.transport.session_id
        if (!session) continue
        if (!groups.has(session)) groups.set(session, [])
        // The trigger needs the session id at the top level; keep the raw value too.
        groups.get(session).push({ ...sub, session })
    }
    let best = { newest: '', group: [] }
    for (const group of groups.values()) {
        const newest = group.map((s) => s.created_at).sort().pop()
        if (newest > best.newest) best = { newest, group }
    }
    return best.group
}

function fireEvent(options, subscription, userId) {
    const args = [
        'exec', options.wsContainer, 'twitch', 'event', 'trigger', subscription.type,
        '-T', 'websocket', '-t', userId,
        '--session', subscription.session,
        '-u', subscription.id,
    ]
    const result = podman(args)
    if (result.status === 0 || !subscription.version) return result
    // A few types exist in more than one version, and the CLI refuses to guess.
    return podman([...args, '--version', subscription.version])
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Podman can return a container's log on either stream, so read both. */
function containerLogs(container, sinceIso) {
    const result = podman(['logs', '--since', sinceIso, container])
    return `${result.stdout || ''}${result.stderr || ''}`
}

/** Counts how many of the fired events the mock says it delivered to a connected client. */
function mockDeliveryCount(container, sinceIso) {
    return (containerLogs(container, sinceIso).match(/Sent \[/g) || []).length
}

/** Counts notifications Node-RED refused because the subscription id was unknown. */
function rejectedCount(container, sinceIso) {
    return (containerLogs(container, sinceIso).match(/Notification from unknown event received/g) || []).length
}

/** Opens the editor's comms socket and records the debug node ids it reports. */
function openSidebar(options, hits) {
    const url = options.nodeRed.replace(/^http/, 'ws') + '/comms'
    return new Promise((resolve) => {
        const socket = new WebSocket(url)
        const settle = (opened) => {
            clearTimeout(timer)
            resolve({ socket, opened })
        }
        const timer = setTimeout(() => settle(false), 5000)
        socket.addEventListener('open', () => {
            if (options.token) socket.send(JSON.stringify({ auth: options.token }))
            socket.send(JSON.stringify({ subscribe: 'debug' }))
            settle(true)
        })
        socket.addEventListener('message', (event) => {
            let frame
            try {
                frame = JSON.parse(event.data)
            } catch {
                return
            }
            for (const entry of frame.msg || []) {
                if (entry.topic === 'debug') hits.add(entry.data.msg[0])
            }
        })
        socket.addEventListener('error', () => settle(false))
    })
}

async function main() {
    const options = parseArgs(process.argv.slice(2))
    const { config, nodes } = loadFlow(options.flow)
    const clientId = options.clientId || config.twitch_client_id || 'mock-client-id'
    const userId = options.user || config.twitch_mock_user_id || config.twitch_user_id
    const port = config.twitch_mock_server_port || '8080'

    if (!userId) throw new Error('No mock user id: pass --user or set twitch_mock_user_id in the flow')

    console.log(`Flow:        ${options.flow}`)
    console.log(`Node-RED:    ${options.nodeRed} (mock port ${port})`)
    console.log(`Client id:   ${clientId}`)
    console.log(`Mock user:   ${userId}`)
    console.log(`Nodes:       ${nodes.length}\n`)

    const subscriptions = liveSessionSubscriptions(listSubscriptions(options, clientId))
    if (!subscriptions.length) {
        console.error('The mock has no subscriptions for this client id.')
        console.error('Deploy the flow so the nodes subscribe, then run this again.')
        process.exit(1)
    }

    const fireable = options.only ? subscriptions.filter((s) => options.only.includes(s.type)) : subscriptions
    console.log(`Live session: ${subscriptions[0].session} with ${subscriptions.length} subscriptions`)
    console.log(`Firing:       ${fireable.length} events\n\n`)

    const sidebarHits = new Set()
    let sidebar = null
    if (options.verify && options.token) {
        sidebar = await openSidebar(options, sidebarHits)
        if (!sidebar.opened) console.error('Could not open the Node-RED comms socket; skipping sidebar checks\n')
    }

    const startedAt = new Date().toISOString()
    const fired = []
    const refused = []
    for (const sub of fireable) {
        const result = fireEvent(options, sub, userId)
        if (result.status === 0) {
            fired.push(sub)
            process.stdout.write(`. ${sub.type}\n`)
        } else {
            const reason = ((result.stderr || result.stdout || '').trim().split('\n').pop() || 'failed')
            refused.push({ ...sub, reason })
            process.stdout.write(`x ${sub.type} - ${reason}\n`)
        }
        await sleep(options.delay)
    }

    if (sidebar) sidebar.socket.close()

    const delivered = options.verify ? mockDeliveryCount(options.wsContainer, startedAt) : 0
    const rejected = options.verify ? rejectedCount(options.nrContainer, startedAt) : 0

    console.log(`\n=== ${fired.length}/${subscriptions.length} events fired ===\n`)
    if (options.verify) {
        console.log(`  mock delivered to the connected client : ${delivered}`)
        console.log(`  notifications Node-RED rejected        : ${rejected}`)
        if (options.token) {
            const confirmed = nodes.filter((n) => sidebarHits.has(n.debugId))
            const silent = nodes.filter((n) => !sidebarHits.has(n.debugId))
            console.log(`  nodes confirmed on the debug sidebar   : ${confirmed.length}/${nodes.length}`)
            if (silent.length) {
                console.log('\n--- nodes that received nothing ---')
                for (const node of silent) console.log(`  SKIP  ${node.name}`)
            }
        } else {
            console.log('  node payloads: watch the debug nodes in the editor sidebar')
            console.log('  pass --token (or set NODE_RED_TOKEN) to confirm each node automatically')
        }
    }
    if (refused.length) {
        console.log('\n--- the CLI refused these triggers ---')
        for (const item of refused) console.log(`  FAIL  ${item.type} - ${item.reason}`)
    }
    if (fired.length) {
        console.log('\n--- event types covered ---')
        for (const sub of fired) console.log(`  PASS  ${sub.type}`)
    }

    if (options.strict && options.verify && (rejected > 0 || refused.length)) process.exit(1)
}

main().catch((err) => {
    console.error(err.message)
    process.exit(1)
})
