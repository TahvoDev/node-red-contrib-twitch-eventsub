import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetBlocksNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg) => {

      const limit = msg.limit ?? config.limit ?? 20;
      const after = msg.after ?? undefined;

      const configNode = RED.nodes.getNode(config.config) as any;
      const userId = configNode?.config?.twitch_user_id;

      if (!userId) {
        throw new Error('Twitch User ID not found in configuration. Please re-authenticate your config node.');
      }

      return await apiClient.asUser(String(userId), async (ctx) => {
        const result = await ctx.users.getBlocks(String(userId), { limit, after });

        return {
          data: result.data.map(toPlainBlock),
                                    cursor: result.cursor ?? null,
        };
      });
    });
  }

  function toPlainBlock(block: any) {
    return {
      userId:      block.userId,
      userLogin:   block.userLogin,
      displayName: block.displayName,
    };
  }

  (TwitchHelixGetBlocksNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-blocks', TwitchHelixGetBlocksNode as any);
};
