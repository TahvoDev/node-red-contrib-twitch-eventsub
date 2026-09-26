import type { NodeAPI } from 'node-red';
import { AbstractNode } from '../../AbstractNode';
import {
  EVENTS_BY_TYPE,
  type EventSubEventDefinition,
  type EventSubField,
} from './eventsub-registry';

/**
 * Resolves one field mapping against a Twurple event and returns the payload key
 * and value. All of the variation between the 70+ event nodes lives in the field
 * definitions in `eventsub-registry.ts`; this is the only place that interprets them.
 */
function resolveField(field: EventSubField, event: any): [string, unknown] {
  if (typeof field === 'string') {
    return [field, event[field]];
  }

  if ('map' in field) {
    return [field.key, field.map(event)];
  }

  const source = field.from ?? field.key;
  let value = event[source];

  if (field.defaultOn === 'falsy') {
    if (!value) value = field.default;
  } else if (value === undefined || value === null) {
    if ('default' in field) value = field.default;
  }

  return [field.key, value];
}

export function mapEvent(definition: EventSubEventDefinition, event: any): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of definition.fields) {
    const [key, value] = resolveField(field, event);
    payload[key] = value;
  }
  return payload;
}

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
 * The single runtime implementation shared by every EventSub node. A generated
 * stub per node type calls `registerEventsubNode` with its type, and the behaviour
 * is looked up from the registry, so no per-node class exists in source.
 */
class TwitchEventsubNode extends AbstractNode {
  twitchConfig?: TwitchApiConfig;
  private readonly definition: EventSubEventDefinition;
  private nodeUuid: string;

  constructor(config: any, RED: NodeAPI, definition: EventSubEventDefinition) {
    super(config, RED);
    this.definition = definition;
    this.nodeUuid = config.id;

    this.twitchConfig = RED.nodes.getNode(config.config) as unknown as TwitchApiConfig | undefined;
    if (!this.twitchConfig) {
      this.error('No Twitch API Config node configured');
      return;
    }

    this.on('close', (_removed: boolean, done: () => void) => {
      this.twitchConfig?.removeNode(this.nodeUuid, this.definition.type, done);
    });

    this.twitchConfig.addNode(this.nodeUuid, this, this.definition.type);
  }

  /**
   * The config node fans every event out to all of its listeners, so each node
   * guards on its own type. If that ever changes to a type-indexed dispatch the
   * comparison becomes redundant, but it is what keeps a node from emitting
   * another event's payload today.
   */
  triggerTwitchEvent(event: any, subscriptionType: string) {
    if (subscriptionType === this.definition.type) {
      this.send({ payload: mapEvent(this.definition, event) });
    }
  }
}

/**
 * Registers one EventSub node type. Called from the generated per-type stub in
 * `dist/twitch/eventsub/generated/`, which keeps each Node-RED node entry pointing
 * at its own file while all of them share the implementation above.
 */
export function registerEventsubNode(RED: NodeAPI, type: string): void {
  const definition = EVENTS_BY_TYPE[type];
  if (!definition) {
    throw new Error(`Unknown EventSub node type: ${type}`);
  }

  class GeneratedEventsubNode extends TwitchEventsubNode {
    constructor(config: any) {
      super(config, RED, definition);
    }
  }

  // Node-RED's runtime NodeConstructor type describes its internal wrapper, not a
  // class taking the node config, so the cast is required by the published types.
  RED.nodes.registerType(type, GeneratedEventsubNode as any);
}
