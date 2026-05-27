import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixUserBlockNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg) => {
      const payload = msg.payload ?? {};
      const action        = payload.action        ?? config.action ?? 'block';
      const broadcasterId = payload.broadcasterId ?? config.broadcasterId;
      const targetId      = payload.targetId      ?? config.targetId;

      if (!broadcasterId || !targetId) throw new Error('broadcasterId and targetId are required');

      if (action === 'unblock') {
        await apiClient.users.deleteBlock(broadcasterId, targetId);
        return { action: 'unblock', broadcasterId, targetId };
      } else {
        await apiClient.users.createBlock(broadcasterId, targetId, {
          reason:        payload.reason        ?? config.reason        ?? undefined,
          sourceContext: payload.sourceContext  ?? config.sourceContext ?? undefined,
        });
        return { action: 'block', broadcasterId, targetId };
      }
    });
  }

  (TwitchHelixUserBlockNode as any).icon = 'twitch-icon.png';
  RED.nodes.registerType('twitch-helix-user-block', TwitchHelixUserBlockNode as any);
};
