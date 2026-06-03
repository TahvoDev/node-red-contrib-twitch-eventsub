import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetAuthenticatedUserNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg) => {
      const withEmail = (typeof msg.payload === 'boolean' ? msg.payload : config.withEmail) ?? false;

      const configNode = RED.nodes.getNode(config.config) as any;
      const userId = configNode?.config?.twitch_user_id;

      if (!userId) {
        throw new Error('Twitch User ID not found in configuration. Please re-authenticate your config node.');
      }

      const user = await apiClient.users.getAuthenticatedUser(String(userId), withEmail);
      if (!user) throw new Error('Could not fetch authenticated user data from Twitch.');

      return {
        id: user.id,
        name: user.name,
        displayName: user.displayName,
        email: user.email ?? null,
        profilePictureUrl: user.profilePictureUrl,
        description: user.description,
        broadcasterType: user.broadcasterType,
        creationDate: user.creationDate,
      };
    });
  }

  (TwitchHelixGetAuthenticatedUserNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-authenticated-user', TwitchHelixGetAuthenticatedUserNode as any);
};
