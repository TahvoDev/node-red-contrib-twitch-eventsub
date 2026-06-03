import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixUpdateUserNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg) => {

      const description = (typeof msg.payload === 'string' ? msg.payload : msg.payload?.description)
      ?? config.description
      ?? '';

      // Safely grab the authenticated user ID from the config node
      const configNode = RED.nodes.getNode(config.config) as any;
      const userId = configNode?.config?.twitch_user_id;

      if (!userId) {
        throw new Error('Twitch User ID not found in configuration. Please re-authenticate.');
      }

      // Twurple signature requires the explicit user identifier: updateAuthenticatedUser(user, data)
      const user = await apiClient.users.updateAuthenticatedUser(String(userId), { description });

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

  (TwitchHelixUpdateUserNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-update-user-description', TwitchHelixUpdateUserNode as any);
};
