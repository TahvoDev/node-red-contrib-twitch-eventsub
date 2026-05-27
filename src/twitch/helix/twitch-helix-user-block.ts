import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixUserBlockNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg) => {

      const action        = msg.action        ?? config.action ?? 'block';
      const broadcasterId = msg.broadcasterId ?? config.broadcasterId;
      const targetId      = msg.targetId      ?? config.targetId;

      if (!broadcasterId || !targetId) throw new Error('broadcasterId and targetId are required');

      if (action === 'unblock') {
        await apiClient.users.deleteBlock(broadcasterId, targetId);
        return { action: 'unblock', broadcasterId, targetId };
      } else {
        await apiClient.users.createBlock(broadcasterId, targetId, {
          reason:        msg.reason        ?? config.reason        ?? undefined,
          sourceContext: msg.sourceContext  ?? config.sourceContext ?? undefined,
        });
        return { action: 'block', broadcasterId, targetId };
      }
    });
  }

  (TwitchHelixUserBlockNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-user-block', TwitchHelixUserBlockNode as any);
};
