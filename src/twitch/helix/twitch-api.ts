import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import { callEndpoint, isTierEnabled } from './helix-core';
import { specTier } from './define';
import { HELIX_SPECS } from './specs';
import { firstDefined, toStr } from './twitch-helix-utils';

/**
 * The single Helix node. It looks the chosen endpoint up in the registry and
 * runs it through the shared client; there is no per-endpoint node. Endpoints
 * live in `specs/`, the editor metadata is served by the config node's
 * `/twitch-eventsub/helix/endpoints` route.
 */

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dist = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) dist[i][0] = i;
  for (let j = 0; j < cols; j++) dist[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i][j] = Math.min(dist[i - 1][j] + 1, dist[i][j - 1] + 1, dist[i - 1][j - 1] + cost);
    }
  }
  return dist[rows - 1][cols - 1];
}

function suggestions(requested: string): string[] {
  const needle = requested.toLowerCase();
  return HELIX_SPECS.map((spec) => ({ type: spec.type, distance: levenshtein(needle, spec.type.toLowerCase()) }))
    .filter((entry) => entry.distance <= 4)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5)
    .map((entry) => entry.type);
}

module.exports = function (RED: NodeAPI) {
  function TwitchApiNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient: any, msg: any, cfg: any, twitchConfig: any) => {
      const endpoint = toStr(firstDefined(msg.endpoint, cfg.endpoint));
      if (!endpoint) {
        throw new Error('An endpoint is required — pick one in the node or set msg.endpoint');
      }

      const spec = HELIX_SPECS.find((candidate) => candidate.type === endpoint);
      if (!spec) {
        const hint = suggestions(String(endpoint));
        throw new Error(
          `Unknown endpoint "${endpoint}"${hint.length ? ` — did you mean ${hint.join(', ')}?` : ''}`
        );
      }

      const tier = specTier(spec);
      if (!isTierEnabled((RED as any).settings, tier)) {
        throw new Error(`Endpoint "${endpoint}" is in the ${tier} tier, which is not enabled`);
      }

      const dynamic = cfg.fields && typeof cfg.fields === 'object' ? cfg.fields : {};
      const merged = { ...cfg, ...dynamic };
      if (merged.action === undefined && cfg.action !== undefined) merged.action = cfg.action;
      return callEndpoint(spec, apiClient, msg, merged, twitchConfig);
    });
  }

  (TwitchApiNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-api', TwitchApiNode as any);
};
