import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetBlocksNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg) => {
      const payload = msg.payload ?? {};
      const userId = payload.userId ?? config.userId;
      const limit  = payload.limit  ?? config.limit  ?? undefined;
      const after  = payload.after  ?? undefined;

      if (!userId) throw new Error('userId is required');

      const result = await apiClient.users.getBlocks(userId, { limit, after });
      return {
        data:   result.data.map(toPlainBlock),
        cursor: result.cursor ?? null,
      };
    });
  }

  function toPlainBlock(block: any) {
    return {
      userId:      block.userId,
      userLogin:   block.userLogin,
      displayName: block.displayName,
    };
  }

  (TwitchHelixGetBlocksNode as any).icon = 'twitch-icon.png';
  RED.nodes.registerType('twitch-helix-get-blocks', TwitchHelixGetBlocksNode as any);
};
