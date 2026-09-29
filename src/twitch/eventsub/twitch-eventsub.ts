import type { Node, NodeAPI } from 'node-red';
import { EVENTS_BY_TYPE, type EventSubEventDefinition } from './eventsub-registry';
import { mapEvent } from './eventsub-mapper';
import { markUntrusted, sanitizeDeep } from '../../security';

/**
 * The subset of the Twitch API config node this node depends on. Keeping it in a
 * narrow interface means a change to the config node's registration API is a
 * compile error here rather than a silent runtime break.
 */
interface TwitchApiConfig {
  addNode(uuid: string, node: TwitchEventsubNode, type: string): void;
  removeNode(uuid: string, type: string, done: () => void): void;
}

/**
 * The single EventSub node. The event is chosen in the node's config and looked
 * up in the registry, so there is no per-event node type or class. The config node
 * owns the one WebSocket listener and fans every event out to all of its nodes,
 * which is why `triggerTwitchEvent` filters on this node's own event.
 */
// Merged with the class below to add the Node-RED runtime members that
// createNode copies onto the instance.
interface TwitchEventsubNode extends Node {}

class TwitchEventsubNode {
  twitchConfig?: TwitchApiConfig;
  private definition?: EventSubEventDefinition;
  private nodeUuid: string;

  constructor(config: any, RED: NodeAPI) {
    RED.nodes.createNode(this as any, config);
    this.nodeUuid = config.id;

    this.twitchConfig = RED.nodes.getNode(config.config) as unknown as TwitchApiConfig | undefined;
    if (!this.twitchConfig) {
      this.error('No Twitch API Config node configured');
      return;
    }

    // hasOwnProperty, not `EVENTS_BY_TYPE[config.event]`: the config is a trust
    // boundary and an inherited key like "constructor" would otherwise pass the
    // guard and degrade into the service's "unknown type" warning.
    if (!Object.prototype.hasOwnProperty.call(EVENTS_BY_TYPE, config.event)) {
      this.error(`Unknown EventSub event: ${config.event || '(none)'} — pick one in the node`);
      return;
    }
    const definition = EVENTS_BY_TYPE[config.event];
    this.definition = definition;
    // Node-RED's editor `label` is what names the node on the canvas; this only
    // defaults the runtime name (used by the debug sidebar / logs) to the event.
    this.name = this.name || definition.label;

    this.on('close', (_removed: boolean, done: () => void) => {
      this.twitchConfig?.removeNode(this.nodeUuid, definition.type, done);
    });

    this.twitchConfig.addNode(this.nodeUuid, this, definition.type);
  }

  /**
   * The config node fans every event out to all of its listeners, so each node
   * guards on its own event. If that ever changes to an event-indexed dispatch the
   * comparison becomes redundant, but it is what keeps a node from emitting
   * another event's payload today.
   */
  triggerTwitchEvent(event: any, subscriptionType: string) {
    if (this.definition && subscriptionType === this.definition.type) {
      const payload = mapEvent(this.definition, event);
      // Convenience fields are sanitized; the declared `rawEvent` field is kept
      // verbatim (it is the documented escape hatch) and mirrored into
      // msg.twitch.raw. Consumers must treat the whole payload as untrusted.
      for (const key of Object.keys(payload)) {
        if (key === 'rawEvent') continue;
        payload[key] = sanitizeDeep(payload[key]);
      }
      const msg: Record<string, unknown> = { payload };
      markUntrusted(msg, 'eventsub', (payload as Record<string, unknown>).rawEvent ?? payload);
      this.send(msg as any);
    }
  }
}

module.exports = function (RED: NodeAPI) {
  class RegisteredEventsubNode extends TwitchEventsubNode {
    constructor(config: any) {
      super(config, RED);
    }
  }

  // Node-RED's runtime NodeConstructor type describes its internal wrapper, not a
  // class taking the node config, so the cast is required by the published types.
  RED.nodes.registerType('twitch-eventsub', RegisteredEventsubNode as any);
};
