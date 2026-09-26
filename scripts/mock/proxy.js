'use strict'

const http = require('http')
const net = require('net')

const LISTEN_PORT = Number(process.env.PROXY_PORT || 8080)
const MOCK_API_PORT = Number(process.env.MOCK_API_PORT || 8081)
const MOCK_WS_PORT = Number(process.env.MOCK_WS_PORT || 8082)
const UPSTREAM_HOST = process.env.UPSTREAM_HOST || '127.0.0.1'

const log = (...args) => console.log('[proxy]', ...args)

// Twurple sends Helix calls, EventSub subscription management and the EventSub
// WebSocket to a single mockServerPort, so everything has to answer on one port.
const isEventSubPath = (url) => url.startsWith('/ws') || url.startsWith('/eventsub')

const targetPortFor = (url) => (isEventSubPath(url) ? MOCK_WS_PORT : MOCK_API_PORT)

const server = http.createServer((req, res) => {
    const port = targetPortFor(req.url)
    const headers = { ...req.headers, host: `${UPSTREAM_HOST}:${port}` }

    const requestBody = []
    req.on('data', (c) => requestBody.push(c))
    req.on('end', () => {
        const raw = Buffer.concat(requestBody)

        const upstream = http.request(
            { host: UPSTREAM_HOST, port, path: req.url, method: req.method, headers },
            (upstreamRes) => {
                const chunks = []
                upstreamRes.on('data', (c) => chunks.push(c))
                upstreamRes.on('end', () => {
                    const body = Buffer.concat(chunks)
                    log(req.method, req.url, '->', port, upstreamRes.statusCode, describe(req, raw, body))
                    res.writeHead(upstreamRes.statusCode, upstreamRes.headers)
                    res.end(body)
                })
            }
        )

        upstream.on('error', (err) => {
            log(req.method, req.url, '->', port, 'ERROR', err.message)
            res.writeHead(502, { 'Content-Type': 'text/plain' })
            res.end(`mock upstream error: ${err.message}`)
        })

        upstream.end(raw)
    })
})

/** Keeps the interesting part of a subscription call in one line of log. */
function describe(req, requestBody, responseBody) {
    const isSubscription = req.url.startsWith('/eventsub/subscriptions')
    if (!isSubscription || (!requestBody.length && !responseBody.length)) return ''

    const read = (body) => {
        try {
            return JSON.parse(body.toString())
        } catch {
            return null
        }
    }
    const request = read(requestBody)
    const response = read(responseBody)
    const type = (request && request.type) || (response && response.data && response.data[0] && response.data[0].type)
    const version = (request && request.version) || (response && response.data && response.data[0] && response.data[0].version)
    const error = response && response.error === 'invalid_type_version' ? 'invalid_type_version' : response && response.message

    return [
        type && `type=${type}`,
        version && `version=${version}`,
        error && `error=${error}`,
    ].filter(Boolean).join(' ')
}

server.on('upgrade', (req, socket, head) => {
    const headers = { ...req.headers, host: `${UPSTREAM_HOST}:${MOCK_WS_PORT}` }
    const requestLines = [`GET ${req.url} HTTP/1.1`]

    for (const [name, value] of Object.entries(headers)) {
        if (Array.isArray(value)) {
            for (const item of value) requestLines.push(`${name}: ${item}`)
        } else {
            requestLines.push(`${name}: ${value}`)
        }
    }

    const upstream = net.connect(MOCK_WS_PORT, UPSTREAM_HOST, () => {
        log('WS', req.url, '->', MOCK_WS_PORT)
        upstream.write(`${requestLines.join('\r\n')}\r\n\r\n`)
        if (head && head.length) upstream.write(head)
        upstream.pipe(socket)
        socket.pipe(upstream)
    })

    const drop = () => {
        upstream.destroy()
        socket.destroy()
    }

    upstream.on('error', (err) => {
        log('WS', req.url, 'ERROR', err.message)
        drop()
    })
    socket.on('error', drop)
})

server.listen(LISTEN_PORT, '127.0.0.1', () => {
    log(`listening on 127.0.0.1:${LISTEN_PORT}`)
    log(`  /mock/*, everything else -> ${UPSTREAM_HOST}:${MOCK_API_PORT} (twitch mock-api)`)
    log(`  /ws, /eventsub/*         -> ${UPSTREAM_HOST}:${MOCK_WS_PORT} (twitch event websocket start-server)`)
})
