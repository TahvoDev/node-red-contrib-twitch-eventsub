import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetAuthenticatedUserNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg) => {
      const payload   = msg.payload ?? {};
      const userId    = payload.userId    ?? config.userId;
      const withEmail = payload.withEmail ?? config.withEmail ?? false;

      if (!userId) throw new Error('userId is required');

      const user = await apiClient.users.getAuthenticatedUser(userId, withEmail);
      if (!user) return null;

      return {
        id:                 user.id,
        name:               user.name,
        displayName:        user.displayName,
        email:              user.email ?? null,
        profilePictureUrl:  user.profilePictureUrl,
        description:        user.description,
        broadcasterType:    user.broadcasterType,
        creationDate:       user.creationDate,
      };
    });
  }

  (TwitchHelixGetAuthenticatedUserNode as any).icon = 'twitch-icon.png';
  RED.nodes.registerType('twitch-helix-get-authenticated-user', TwitchHelixGetAuthenticatedUserNode as any);
};
