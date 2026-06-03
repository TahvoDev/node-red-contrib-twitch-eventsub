import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixUserBlockNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg) => {

      const action = msg.action ?? config.action ?? 'block';
      let targetInput = msg.targetId ?? config.targetId;

      if (!targetInput) {
        throw new Error('Target User ID or Username is required to complete this action.');
      }

      // 1. Look up the configuration node context for the broadcaster
      const configNode = RED.nodes.getNode(config.config) as any;
      const broadcasterId = msg.broadcasterId ?? configNode?.config?.twitch_user_id;

      if (!broadcasterId) {
        throw new Error('Broadcaster User ID not found. Please ensure your config node is authenticated.');
      }

      // Trim whitespace from target input string
      targetInput = String(targetInput).trim();
      let targetId = '';

      // 2. Resolve Target ID: If it's not strictly numeric, treat it as a username and look it up
    if (/^\d+$/.test(targetInput)) {
      targetId = targetInput;
    } else {
      const userResolved = await apiClient.users.getUserByName(targetInput);
      if (!userResolved) {
        throw new Error(`Twitch user "${targetInput}" could not be found.`);
      }
      targetId = userResolved.id;
    }

    const bIdStr = String(broadcasterId);
    const tIdStr = String(targetId);

    // 3. Execute Block / Unblock action
    if (action === 'unblock') {
      await apiClient.users.deleteBlock(bIdStr, tIdStr);
      return { action: 'unblock', broadcasterId: bIdStr, targetId: tIdStr, targetName: targetInput };
    } else {
      await apiClient.users.createBlock(bIdStr, tIdStr, {
        reason:        msg.reason        ?? config.reason        ?? undefined,
        sourceContext: msg.sourceContext ?? config.sourceContext ?? undefined,
      });
      return { action: 'block', broadcasterId: bIdStr, targetId: tIdStr, targetName: targetInput };
    }
    });
  }

  (TwitchHelixUserBlockNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-user-block', TwitchHelixUserBlockNode as any);
};
