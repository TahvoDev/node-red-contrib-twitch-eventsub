/**
 * The declarative spec format for Helix nodes.
 *
 * A node is data: its palette label, help text, required scopes, config fields
 * and the single API call it makes. The factory turns a spec into a Node-RED
 * handler and the build turns it into a palette type, so adding an endpoint is
 * a spec entry rather than a hand-written .ts/.html pair.
 */

export type HelixFieldKind = 'user' | 'int' | 'bool' | 'string' | 'select' | 'idList';

export interface HelixSelectOption {
  value: string;
  label?: string;
}

export interface HelixField {
  /** Node config key and `msg.<name>` override. */
  name: string;
  /** Plain-English editor label. */
  label: string;
  kind: HelixFieldKind;
  default?: unknown;
  required?: boolean;
  optional?: boolean;
  /** Short placeholder / help hint. */
  hint?: string;
  /** Allowed values for `select`. A value outside the list falls back to the default. */
  options?: Array<HelixSelectOption | string>;
  /** `msg.payload` may override this field (the `withEmail` convention). */
  primary?: boolean;
  /** Extra `msg.<alias>` names accepted for this field, for legacy overrides. */
  aliases?: string[];
  /** Keep the field in `defaults` and help, but omit it from the editor form. */
  hidden?: boolean;
  /** Font Awesome icon for the form row; defaults by kind. */
  faIcon?: string;
}

export interface HelixRunContext {
  /** The API client to call, already scoped to the spec's context user. */
  api: any;
  /** The unscoped client, for the rare spec that needs a different user context. */
  root: any;
  twitchConfig: any;
  /** Resolved broadcaster id; defaults to the authenticated user. */
  broadcasterId: string;
  /** Resolved moderator id; defaults to the authenticated user. */
  moderatorId: string;
  /** Coerced field values: user fields are resolved to ids. */
  input: Record<string, any>;
  /** Uncoerced field values, for messages that echo what the user typed. */
  raw: Record<string, string | undefined>;
  msg: any;
  config: any;
}

export interface HelixPagedSpec {
  /** Default page size (Twitch caps at 100). */
  limit?: number;
  /** Default cap for the "get all" option. */
  max?: number;
}

export interface HelixSpec {
  /** Node-RED type, e.g. `twitch-helix-get-authenticated-user`. */
  type: string;
  /** Plain-English label shown in the palette and as the node label. */
  label: string;
  /** One-line description used in the node help. */
  help: string;
  /** OAuth scopes the node needs; the factory checks them before the call. */
  scopes: string[];
  fields: HelixField[];
  /** Makes the twurple call. Nothing else. */
  run: (ctx: HelixRunContext) => Promise<any>;
  /** Converts the twurple result to a plain serialisable object. */
  map?: (result: any, ctx: HelixRunContext) => any;
  /** Extra message properties to merge (pagination, total, ...) for non-paged specs. */
  extra?: (result: any, ctx: HelixRunContext) => Record<string, any> | undefined;
  /** Set for list endpoints; adds limit/all/allMax fields and pagination handling. */
  paged?: HelixPagedSpec;
  /**
   * Which token user `run` is called as. Defaults to `moderator` (the
   * authenticated user), which is right for almost every endpoint.
   */
  context?: 'moderator' | 'broadcaster' | 'app';
  /** Escape hatch for a node whose editor cannot be generated from fields. */
  customHtml?: string;
  /** Icon filename; defaults to the shared Twitch icon. */
  icon?: string;
  /** Inline `oneditprepare` JS, for the rare node that needs extra validation. */
  oneditprepare?: string;
}

/** Identity helper: gives editors autocomplete and keeps the spec list typed. */
export function defineHelix(spec: HelixSpec): HelixSpec {
  return spec;
}

/** The fields the factory and the editor generator actually use. */
export function effectiveFields(spec: HelixSpec): HelixField[] {
  if (!spec.paged) return spec.fields;
  return [
    ...spec.fields,
    { name: 'limit', label: 'Limit', kind: 'int', default: spec.paged.limit ?? 20, hint: '1-100', optional: true } as HelixField,
    { name: 'all', label: 'Get all', kind: 'bool', default: false, optional: true } as HelixField,
    { name: 'allMax', label: 'Max', kind: 'int', default: spec.paged.max ?? 1000, optional: true } as HelixField,
  ];
}

export function selectValues(field: HelixField): string[] {
  return (field.options ?? []).map((option) =>
    typeof option === 'string' ? option : option.value
  );
}
