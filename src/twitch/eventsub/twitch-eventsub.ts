import type { NodeAPI } from 'node-red';
import { AbstractNode } from '../../AbstractNode';
import { EVENTS_BY_TYPE, type EventSubEventDefinition } from './eventsub-registry';
import { mapEvent } from './eventsub-mapper';

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
export class TwitchEventsubNode extends AbstractNode {
  twitchConfig?: TwitchApiConfig;
  private definition?: EventSubEventDefinition;
  private nodeUuid: string;

  constructor(config: any, RED: NodeAPI) {
    super(config, RED);
    this.nodeUuid = config.id;

    this.twitchConfig = RED.nodes.getNode(config.config) as unknown as TwitchApiConfig | undefined;
    if (!this.twitchConfig) {
      this.error('No Twitch API Config node configured');
      return;
    }

    const definition = EVENTS_BY_TYPE[config.event];
    if (!definition) {
      this.error(`Unknown EventSub event: ${config.event || '(none)'} — pick one in the node`);
      return;
    }
    this.definition = definition;
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
      this.send({ payload: mapEvent(this.definition, event) });
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
