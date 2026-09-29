/**
 * The one code path every Helix call goes through: resolve the chosen endpoint
 * and action, coerce and resolve fields, check scopes, page, and map the
 * result. The `twitch-api` node is a thin wrapper over this; there is no
 * per-endpoint node or factory.
 */

import {
  authUserId,
  clampLimit,
  fetchAllPages,
  firstDefined,
  requireScopes,
  resolveAllMax,
  resolveUserId,
  toBool,
  toIdList,
  toInt,
  toStr,
} from './twitch-helix-utils';
import {
  effectiveFields,
  fieldAliases,
  selectValues,
  type HelixAction,
  type HelixField,
  type HelixSpec,
  type HelixTier,
} from './define';

const TIERS: HelixTier[] = ['core', 'extended', 'advanced'];

/**
 * The tiers the host has enabled through `settings.js` (`twitchApi.tiers`).
 * Defaults to `core` only.
 */
export function enabledTiers(settings: any): HelixTier[] {
  const configured = settings?.twitchApi?.tiers;
  if (!Array.isArray(configured)) return ['core'];
  const valid = configured.filter((tier: any): tier is HelixTier => TIERS.indexOf(tier) !== -1);
  return valid.length ? valid : ['core'];
}

export function isTierEnabled(settings: any, tier: HelixTier | undefined): boolean {
  return enabledTiers(settings).indexOf(tier ?? 'core') !== -1;
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

/** Coerces a raw field value by its declared kind. */
async function coerceField(apiClient: any, field: HelixField, value: unknown): Promise<any> {
  switch (field.kind) {
    case 'user': {
      const login = toStr(value);
      return login ? resolveUserId(apiClient, login) : undefined;
    }
    case 'int':
      return toInt(value);
    case 'bool':
      return toBool(value);
    case 'idList':
      return toIdList(value);
    case 'select': {
      const chosen = toStr(value);
      if (!chosen) return undefined;
      const allowed = selectValues(field);
      if (allowed.length && allowed.indexOf(chosen) === -1) {
        // An unrecognised value falls back to the default rather than erroring.
        const fallback = toStr(field.default);
        return fallback && allowed.indexOf(fallback) !== -1 ? fallback : undefined;
      }
      return chosen;
    }
    default:
      return toStr(value);
  }
}

function rawValue(field: HelixField, value: unknown): any {
  return field.kind === 'idList' ? value : toStr(value);
}

/** The resolved call for one message: either the entry itself or its chosen action. */
export interface ActiveCall {
  action?: string;
  scopes: string[];
  fields: HelixField[];
  run: (ctx: any) => Promise<any>;
  map?: (result: any, ctx: any) => any;
  extra?: (result: any, ctx: any) => Record<string, any> | undefined;
  paged?: HelixSpec['paged'];
  context?: HelixSpec['context'];
}

/**
 * Resolves the action as `msg.action` → node config → `defaultAction`. An
 * unknown action fails with the list of valid ones.
 */
export function resolveActiveCall(spec: HelixSpec, msg: any, config: any): ActiveCall {
  if (!spec.actions) {
    if (!spec.run) throw new Error(`Helix endpoint ${spec.type} has no run function`);
    return {
      scopes: spec.scopes,
      fields: effectiveFields(spec),
      run: spec.run,
      map: spec.map,
      extra: spec.extra,
      paged: spec.paged,
      context: spec.context,
    };
  }

  const names = Object.keys(spec.actions);
  const chosen = firstDefined(
    toStr(msg.action),
    toStr(config.action),
    spec.defaultAction,
    names[0]
  ) as string;
  const action: HelixAction | undefined = spec.actions[chosen];
  if (!action) {
    throw new Error(`Unknown action "${chosen}" — valid actions: ${names.join(', ')}`);
  }

  return {
    action: chosen,
    scopes: action.scopes,
    fields: effectiveFields(spec, action),
    run: action.run,
    map: action.map ?? spec.map,
    extra: action.extra ?? spec.extra,
    paged: action.paged ?? spec.paged,
    context: action.context ?? spec.context,
  };
}

/**
 * Runs one registry entry for a message. `config` already has any dynamic
 * fields merged in by the caller.
 */
export async function callEndpoint(
  spec: HelixSpec,
  apiClient: any,
  msg: any,
  config: any,
  twitchConfig: any
): Promise<any> {
  const call = resolveActiveCall(spec, msg, config);
  requireScopes(twitchConfig, call.scopes);

  const input: Record<string, any> = {};
  const raw: Record<string, any> = {};

  for (const field of call.fields) {
    const payloadOverride = field.primary && msg.payload !== undefined ? msg.payload : undefined;
    const aliasValue = fieldAliases(field)
      .map((alias) => msg[alias])
      .find((value) => value !== undefined);
    const value = firstDefined(
      aliasValue,
      msg[field.name],
      payloadOverride,
      config[field.name],
      field.default
    );
    input[field.name] = await coerceField(apiClient, field, value);
    raw[field.name] = rawValue(field, value);

    if (field.required && isEmpty(input[field.name])) {
      throw new Error(`${field.label} is required — set msg.${field.name} or the node field`);
    }
  }

  const authId = authUserId(twitchConfig);
  const hasBroadcaster = call.fields.some((field) => field.name === 'broadcaster');
  const hasModerator = call.fields.some((field) => field.name === 'moderator');
  const broadcasterId = String((hasBroadcaster ? input.broadcaster : undefined) ?? authId);
  const moderatorId = String((hasModerator ? input.moderator : undefined) ?? authId);

  const ctx = {
    twitchConfig,
    broadcasterId,
    moderatorId,
    input,
    raw,
    msg,
    config,
    action: call.action,
    api: undefined as any,
    root: apiClient,
  };

  const contextUser =
    call.context === 'app'
      ? undefined
      : call.context === 'broadcaster'
        ? broadcasterId
        : moderatorId;

  const invoke = (after?: string) => {
    const scopedInput = after === undefined ? input : { ...input, after };
    const apiCall = (api: any) => call.run({ ...ctx, api, input: scopedInput });
    return contextUser ? apiClient.asUser(contextUser, apiCall) : apiCall(apiClient);
  };

  if (!call.paged) {
    const result = await invoke();
    return {
      payload: call.map ? call.map(result, ctx) : result,
      extra: call.extra ? call.extra(result, ctx) : undefined,
    };
  }

  input.limit = clampLimit(input.limit, call.paged.limit ?? 20);
  const afterValue = firstDefined(msg.after, msg.cursor);
  const fetchPage = async (cursor?: string) => {
    const res = await invoke(cursor ?? afterValue);
    return { data: res?.data ?? [], cursor: res?.cursor ?? null, total: res?.total };
  };

  const getAll = input.all === true;
  const result = getAll
    ? await fetchAllPages(fetchPage, resolveAllMax(input.allMax))
    : await fetchPage();

  const mapped = result.data.map((item: any) => (call.map ? call.map(item, ctx) : item));
  const extra: Record<string, any> = {
    pagination: { cursor: result.cursor ?? null },
    total: result.total,
  };
  // Stopped at the safety ceiling with pages left: say so, and leave the cursor.
  if (getAll && result.cursor) extra.truncated = true;
  return { payload: mapped, extra };
}
