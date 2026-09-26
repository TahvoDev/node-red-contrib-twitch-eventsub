'use strict'

/**
 * Synthetic EventSub events used to compare payload mappings.
 *
 * Twurple hands the node a class instance with getters, but every mapping only
 * reads plain properties, so a proxy that answers every property deterministically
 * exercises the same code path without needing a live Twurple object. Two variants
 * are produced per event:
 *
 *   full   every scalar property is present
 *   sparse only array/object properties are present, so the `??`/`||` defaults run
 */

const ARRAY_PROPERTIES = new Set([
    'choices',
    'outcomes',
    'topContributions',
    'topContributors',
    'messageParts',
    'badges',
    'sourceBadges',
    'terms',
    'chatRulesCited',
    'blockedTerms',
    'sharedTrainParticipants',
    'emotes',
])

const OBJECT_PROPERTIES = new Set([
    'lastContribution',
    'bitsVoting',
    'channelPointsVoting',
])

const VARIANTS = ['full', 'sparse']

function scalar(prop) {
    return `value:${String(prop)}`
}

function nested() {
    return new Proxy({}, { get: (_target, prop) => scalar(prop) })
}

function makeEvent(sparse) {
    return new Proxy(
        {},
        {
            get: (_target, prop) => {
                if (typeof prop !== 'string') return undefined
                if (ARRAY_PROPERTIES.has(prop)) return [nested()]
                if (OBJECT_PROPERTIES.has(prop)) return nested()
                return sparse ? undefined : scalar(prop)
            },
        }
    )
}

/** One { type, variant, event } per event and per variant. */
function eventsFor(types) {
    const out = []
    for (const type of types) {
        for (const variant of VARIANTS) {
            out.push({ type, variant, event: makeEvent(variant === 'sparse') })
        }
    }
    return out
}

/** Replaces the raw event with a marker so comparisons stay small and stable. */
function normalize(payload) {
    if (payload && typeof payload === 'object' && 'rawEvent' in payload) {
        return { ...payload, rawEvent: '<rawEvent>' }
    }
    return payload
}

module.exports = { eventsFor, normalize, VARIANTS }
