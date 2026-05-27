import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixUpdateUserNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg) => {
      const payload = msg.payload ?? {};
      const userId      = payload.userId      ?? config.userId;
      const description = payload.description ?? config.description ?? undefined;

      if (!userId) throw new Error('userId is required');

      const user = await apiClient.users.updateAuthenticatedUser(userId, { description });
      return {
        id:              user.id,
        name:            user.name,
        displayName:     user.displayName,
        description:     user.description,
        broadcasterType: user.broadcasterType,
        creationDate:    user.creationDate,
      };
    });
  }

  (TwitchHelixUpdateUserNode as any).icon = 'twitch-icon.png';
  RED.nodes.registerType('twitch-helix-update-user', TwitchHelixUpdateUserNode as any);
};
