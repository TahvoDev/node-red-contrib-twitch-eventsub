import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetExtensionsNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg) => {
      const payload      = msg.payload ?? {};
      const userId       = payload.userId       ?? config.userId;
      const activeOnly   = payload.activeOnly   ?? config.activeOnly ?? false;
      const withInactive = payload.withInactive ?? config.withInactive ?? false;
      const withDev      = payload.withDev      ?? config.withDev ?? false;

      if (!userId) throw new Error('userId is required');

      if (activeOnly) {
        const result = await apiClient.users.getActiveExtensions(userId, withDev);
        return toPlainInstalledList(result);
      } else {
        const result = await apiClient.users.getExtensionsForAuthenticatedUser(userId, withInactive);
        return result.map(toPlainExtension);
      }
    });
  }

  function toPlainInstalledList(list: any) {
    if (!list) return null;
    return {
      panels:     Object.entries(list.panelSlots   ?? {}).map(([slot, e]: any) => ({ slot, ...toPlainExtension(e) })),
      overlays:   Object.entries(list.overlaySlots ?? {}).map(([slot, e]: any) => ({ slot, ...toPlainExtension(e) })),
      components: Object.entries(list.componentSlots ?? {}).map(([slot, e]: any) => ({ slot, ...toPlainExtension(e) })),
    };
  }

  function toPlainExtension(ext: any) {
    if (!ext) return null;
    return {
      id:      ext.id,
      name:    ext.name,
      version: ext.version,
      active:  ext.active ?? undefined,
    };
  }

  (TwitchHelixGetExtensionsNode as any).icon = 'twitch-icon.png';
  RED.nodes.registerType('twitch-helix-get-extensions', TwitchHelixGetExtensionsNode as any);
};
