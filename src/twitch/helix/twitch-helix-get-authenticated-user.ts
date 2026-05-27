import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetAuthenticatedUserNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg) => {

      const userId    = msg.userId    ?? config.userId;
      const withEmail = msg.withEmail ?? config.withEmail ?? false;

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

  RED.nodes.registerType('twitch-helix-get-authenticated-user', TwitchHelixGetAuthenticatedUserNode as any);

};
