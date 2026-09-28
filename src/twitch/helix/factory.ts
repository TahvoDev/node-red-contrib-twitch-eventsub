import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  clampLimit,
  fetchAllPages,
  firstDefined,
  requireScopes,
  resolveUserId,
  toBool,
  toIdList,
  toInt,
  toStr,
} from './twitch-helix-utils';
import { effectiveFields, selectValues, type HelixField, type HelixSpec } from './define';
import { HELIX_SPECS } from './specs';

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

/**
 * Turns a spec into the handler `createHelixNode` expects. All resolution,
 * coercion, scope checks, paging and result mapping live here, so a spec's
 * `run` is only the twurple call.
 */
export function makeHandler(spec: HelixSpec) {
  const fields = effectiveFields(spec);

  return async (apiClient: any, msg: any, config: any, twitchConfig: any) => {
    requireScopes(twitchConfig, spec.scopes);

    const input: Record<string, any> = {};
    const raw: Record<string, any> = {};

    for (const field of fields) {
      const payloadOverride = field.primary && msg.payload !== undefined ? msg.payload : undefined;
      const aliasValue = (field.aliases ?? [])
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
    const hasBroadcaster = fields.some((field) => field.name === 'broadcaster');
    const hasModerator = fields.some((field) => field.name === 'moderator');
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
      api: undefined as any,
      root: apiClient,
    };

    const contextUser =
      spec.context === 'app'
        ? undefined
        : spec.context === 'broadcaster'
          ? broadcasterId
          : moderatorId;

    const invoke = (after?: string) => {
      const scopedInput = after === undefined ? input : { ...input, after };
      const call = (api: any) => spec.run({ ...ctx, api, input: scopedInput });
      return contextUser ? apiClient.asUser(contextUser, call) : call(apiClient);
    };

    if (!spec.paged) {
      const result = await invoke();
      return {
        payload: spec.map ? spec.map(result, ctx) : result,
        extra: spec.extra ? spec.extra(result, ctx) : undefined,
      };
    }

    input.limit = clampLimit(input.limit, spec.paged.limit ?? 20);
    const afterValue = firstDefined(msg.after, msg.cursor);
    const fetchPage = async (cursor?: string) => {
      const res = await invoke(cursor ?? afterValue);
      return { data: res?.data ?? [], cursor: res?.cursor ?? null, total: res?.total };
    };

    const max = toInt(firstDefined(input.allMax, spec.paged.max), spec.paged.max ?? 1000) ?? 1000;
    const result =
      input.all === true || toBool(input.all) === true
        ? await fetchAllPages(fetchPage, max)
        : await fetchPage();

    const mapped = result.data.map((item) => (spec.map ? spec.map(item, ctx) : item));
    return {
      payload: mapped,
      extra: { pagination: { cursor: result.cursor ?? null }, total: result.total },
    };
  };
}

/** Registers one generated Helix node type by looking its spec up. */
export function registerHelixNode(RED: NodeAPI, type: string): void {
  const spec = HELIX_SPECS.find((candidate) => candidate.type === type);
  if (!spec) throw new Error(`Unknown Helix node spec: ${type}`);

  function HelixSpecNode(this: any, config: any) {
    createHelixNode(RED, this, config, makeHandler(spec as HelixSpec));
  }

  (HelixSpecNode as any).icon = spec.icon ?? 'twitch-icon.svg';
  RED.nodes.registerType(spec.type, HelixSpecNode as any);
}
