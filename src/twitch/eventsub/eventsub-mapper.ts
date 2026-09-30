import type { EventSubEventDefinition, EventSubField } from './eventsub-registry';
import { sanitizeInbound } from '../twitch-shared';

/**
 * Resolves one field mapping against a Twurple event and returns the payload key
 * and value. All of the variation between the 70+ events lives in the field
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

/**
 * `rawEvent` stays verbatim: it is the unmodified Twitch payload, and consumers
 * that want the original bytes opt into it explicitly. Every other value is
 * normalised so no Twitch-sourced string reaches a flow unsanitized.
 */
export function mapEvent(definition: EventSubEventDefinition, event: any): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of definition.fields) {
    const [key, value] = resolveField(field, event);
    payload[key] = key === 'rawEvent' ? value : sanitizeInbound(value);
  }
  return payload;
}
