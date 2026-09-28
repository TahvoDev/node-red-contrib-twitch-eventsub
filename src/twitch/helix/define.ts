/**
 * The declarative spec format for Helix nodes.
 *
 * An endpoint is data: its label, help text, tier, config fields
 * and the API call(s) it makes. An endpoint with a single verb is a plain spec;
 * one that groups a resource behind an action dropdown declares `actions`. The
 * single `twitch-api` node runs them all, so adding or regrouping endpoints is a
 * spec change, not a code change.
 */

export type HelixFieldKind = 'user' | 'int' | 'bool' | 'string' | 'select' | 'idList';

/** Which palette tier a node belongs to. Only enabled tiers register. */
export type HelixTier = 'core' | 'extended' | 'advanced';

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
  /** The action name when the node is an action node, otherwise undefined. */
  action?: string;
}

export interface HelixPagedSpec {
  /** Default page size (Twitch caps at 100). */
  limit?: number;
}

/** One entry in an action node's dropdown. Carries the whole call for that verb. */
export interface HelixAction {
  /** Plain-English dropdown label, e.g. `add`. */
  label: string;
  /** One-line description shown in this action's help block. */
  help: string;
  /** OAuth scopes this action needs, checked just before the call. */
  scopes: string[];
  fields: HelixField[];
  /** Makes the twurple call. Nothing else. */
  run: (ctx: HelixRunContext) => Promise<any>;
  /** Converts the twurple result to a plain serialisable object. */
  map?: (result: any, ctx: HelixRunContext) => any;
  /** Extra message properties to merge (pagination, total, ...) for non-paged specs. */
  extra?: (result: any, ctx: HelixRunContext) => Record<string, any> | undefined;
  /** Set for list actions; adds limit/all/allMax fields and pagination handling. */
  paged?: HelixPagedSpec;
  /** Which token user `run` is called as; defaults to the node's context. */
  context?: 'moderator' | 'broadcaster' | 'app';
}

export interface HelixSpec {
  /** Node-RED type, e.g. `twitch-helix-bans`. */
  type: string;
  /** Plain-English label shown in the palette and as the node label. */
  label: string;
  /** One-line description used in the node help. */
  help: string;
  /** Palette tier; defaults to `core`. Only enabled tiers register. */
  tier?: HelixTier;
  /**
   * OAuth scopes the node needs. For an action node this is the union shown in
   * the docs; the per-action scopes are checked at runtime.
   */
  scopes: string[];
  /** Shared fields shown for every action (or the whole field list when standalone). */
  fields: HelixField[];
  /** Makes the twurple call for a standalone node. Omit when `actions` is set. */
  run?: (ctx: HelixRunContext) => Promise<any>;
  /** Action dropdown for a resource node. Mutually exclusive with `run`. */
  actions?: Record<string, HelixAction>;
  /** Action selected when `msg.action` and the node config are both blank. */
  defaultAction?: string;
  /** Converts the twurple result to a plain serialisable object. */
  map?: (result: any, ctx: HelixRunContext) => any;
  /** Extra message properties to merge (pagination, total, ...) for non-paged specs. */
  extra?: (result: any, ctx: HelixRunContext) => Record<string, any> | undefined;
  /** Set for list nodes; adds limit/all/allMax fields and pagination handling. */
  paged?: HelixPagedSpec;
  /**
   * Which token user `run` is called as. Defaults to `moderator` (the
   * authenticated user), which is right for almost every endpoint.
   */
  context?: 'moderator' | 'broadcaster' | 'app';
}

/** Identity helper: gives editors autocomplete and keeps the spec list typed. */
export function defineHelix(spec: HelixSpec): HelixSpec {
  return spec;
}

export function specTier(spec: HelixSpec): HelixTier {
  return spec.tier ?? 'core';
}

/** The action names in dropdown order (declaration order). */
function actionNames(spec: HelixSpec): string[] {
  return spec.actions ? Object.keys(spec.actions) : [];
}

export function defaultActionName(spec: HelixSpec): string | undefined {
  const names = actionNames(spec);
  if (!names.length) return undefined;
  return spec.defaultAction && spec.actions![spec.defaultAction]
    ? spec.defaultAction
    : names[0];
}

/** Every scope the spec can need, across all actions, in first-seen order. */
export function specScopes(spec: HelixSpec): string[] {
  const scopes = [...spec.scopes];
  for (const action of Object.values(spec.actions ?? {})) {
    for (const scope of action.scopes) {
      if (scopes.indexOf(scope) === -1) scopes.push(scope);
    }
  }
  return scopes;
}

/** The paged config used for one action (falls back to the node's `paged`). */
function actionPaged(spec: HelixSpec, action?: HelixAction): HelixPagedSpec | undefined {
  return action?.paged ?? spec.paged;
}

/**
 * The fields the twitch-api runtime and editor actually use for one action:
 * shared + action fields, plus the generated paging fields. De-duplicated by
 * name so an action that reuses a shared field (e.g. `broadcaster`) renders once.
 */
export function effectiveFields(
  spec: HelixSpec,
  action?: HelixAction
): HelixField[] {
  const base = action ? [...spec.fields, ...action.fields] : spec.fields;
  const paged = actionPaged(spec, action);
  const all: HelixField[] = paged
    ? [
        ...base,
        { name: 'limit', label: 'Limit', kind: 'int', default: paged.limit ?? 20, hint: 'rows per request (1-100)', optional: true } as HelixField,
        { name: 'all', label: 'Get all', kind: 'bool', default: false, hint: 'follow every page', optional: true } as HelixField,
        { name: 'allMax', label: 'Max', kind: 'int', default: '', hint: 'blank = every row, up to 50000', optional: true } as HelixField,
      ]
    : base;

  const seen = new Set<string>();
  return all.filter((field) => {
    if (seen.has(field.name)) return false;
    seen.add(field.name);
    return true;
  });
}

export function selectValues(field: HelixField): string[] {
  return (field.options ?? []).map((option) =>
    typeof option === 'string' ? option : option.value
  );
}

/**
 * Twitch's broadcaster, channel and user ids are the same number, and a login
 * resolves to the same id however it is named. So the shared `broadcaster`
 * field also reads `msg.channel`/`msg.channelId` (a chat node's message maps
 * straight in) and any `user` field also reads `msg.userId`. Declared aliases
 * are kept and merged with these.
 */
function impliedAliases(field: HelixField): string[] {
  if (field.name === 'broadcaster') return ['broadcasterId', 'channel', 'channelId'];
  if (field.name === 'user') return ['userId'];
  return [];
}

/** The declared aliases plus the identity aliases every matching field accepts. */
export function fieldAliases(field: HelixField): string[] {
  return [...new Set([...(field.aliases ?? []), ...impliedAliases(field)])];
}
