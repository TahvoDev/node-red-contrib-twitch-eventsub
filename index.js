'use strict'

const SERVICE = './dist/twitch/eventsub/twitch-eventsub-service'

module.exports = {
    get TwitchEventsubService() {
        return require(SERVICE).TwitchEventsubService
    }
}
