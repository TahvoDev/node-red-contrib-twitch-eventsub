#!/usr/bin/env node
'use strict'

/**
 * Builds the e2e mock flow: one `twitch-eventsub` node per registry event, wired
 * to a debug node, plus the `twitch-api-config` mock config. Replaces the old
 * hand-committed examples/mock-all-nodes.json so the flow can never drift from
 * the registry.
 *
 *   node test/e2e/make-flow.js [out.json]
 *
 * run-e2e.js and fire-all-events.js call buildFlow()/writeMockFlow() directly;
 * the CLI form is for manual runs. Needs a built dist/.
 */

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..', '..')
const CONFIG_ID = 'twitchconfig0000000000000001'
const TAB_ID = 'tab-mock-00000000000001'

const MOCK_CONFIG = {
  id: CONFIG_ID,
  type: 'twitch-api-config',
  name: 'twitch mock (local)',
  twitch_client_id: '',
  twitch_user_id: '',
  twitch_user_login: '',
  twitch_mock_server_port: '8080',
  twitch_mock_user_id: '3963854',
}

function buildFlow() {
  const { EVENTS } = require(path.join(root, 'dist', 'twitch', 'eventsub', 'eventsub-registry.js'))

  const flow = [
    MOCK_CONFIG,
    { id: TAB_ID, type: 'tab', label: 'mock all events', disabled: false, info: '' },
  ]

  EVENTS.forEach((event, index) => {
    const nodeId = `ev-${event.type}-${index}`
    const debugId = `dbg-${event.type}-${index}`
    const y = 120 + index * 60

    flow.push({
      id: nodeId,
      type: 'twitch-eventsub',
      z: TAB_ID,
      name: event.type,
      config: CONFIG_ID,
      event: event.type,
      x: 640,
      y,
      wires: [[debugId]],
    })
    flow.push({
      id: debugId,
      type: 'debug',
      z: TAB_ID,
      name: event.type,
      active: true,
      tosidebar: true,
      console: false,
      tostatus: false,
      complete: 'false',
      statusVal: '',
      statusType: 'auto',
      x: 940,
      y,
      wires: [],
    })
  })

  return flow
}

function writeMockFlow(outPath) {
  fs.writeFileSync(outPath, `${JSON.stringify(buildFlow(), null, 2)}\n`)
  return outPath
}

module.exports = { buildFlow, writeMockFlow }

if (require.main === module) {
  const out = process.argv[2] || path.join(root, 'examples', 'mock-all-nodes.json')
  console.log(`wrote ${writeMockFlow(out)}`)
}
