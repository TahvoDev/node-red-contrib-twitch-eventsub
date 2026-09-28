'use strict'

const SERVICE = './dist/twitch/eventsub/twitch-eventsub-service'
const HELIX_SPECS = './dist/twitch/helix/specs'

module.exports = {
    get TwitchEventsubService() {
        return require(SERVICE).TwitchEventsubService
    },
    // The declarative Helix node specs, exposed for tooling/tests. Node-RED
    // itself loads each generated node module through the node-red.nodes map.
    get HelixSpecs() {
        return require(HELIX_SPECS).HELIX_SPECS
    }
}
