import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixUpdateExtensionsNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg) => {
      const payload = msg.payload ?? {};
      const userId = payload.userId ?? config.userId;
      const data   = payload.data;

      if (!userId) throw new Error('userId is required');
      if (!data)   throw new Error('payload.data with extension update payload is required');

      const result = await apiClient.users.updateActiveExtensionsForAuthenticatedUser(userId, data);
      return {
        panels:     Object.entries(result.panelSlots    ?? {}).map(([slot, e]: any) => ({ slot, id: e.id, name: e.name, version: e.version })),
        overlays:   Object.entries(result.overlaySlots  ?? {}).map(([slot, e]: any) => ({ slot, id: e.id, name: e.name, version: e.version })),
        components: Object.entries(result.componentSlots ?? {}).map(([slot, e]: any) => ({ slot, id: e.id, name: e.name, version: e.version })),
      };
    });
  }

  (TwitchHelixUpdateExtensionsNode as any).icon = 'twitch-icon.png';
  RED.nodes.registerType('twitch-helix-update-extensions', TwitchHelixUpdateExtensionsNode as any);
};
