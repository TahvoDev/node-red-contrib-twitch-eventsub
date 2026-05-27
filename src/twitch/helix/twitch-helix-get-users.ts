import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetUsersNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg) => {

      const ids    = toArray(msg.userId ?? msg.userIds ?? config.userId);
      const logins = toArray(msg.login  ?? msg.logins  ?? config.login);

      if (ids.length) {
        const result = ids.length === 1
        ? await apiClient.users.getUserById(ids[0])
        : await apiClient.users.getUsersByIds(ids);
        return Array.isArray(result) ? result.map(toPlainUser) : toPlainUser(result);
      }
      if (logins.length) {
        const result = logins.length === 1
        ? await apiClient.users.getUserByName(logins[0])
        : await apiClient.users.getUsersByNames(logins);
        return Array.isArray(result) ? result.map(toPlainUser) : toPlainUser(result);
      }
      throw new Error('No user query provided');
    });
  }

  function toArray(value: any): string[] {
    if (!value) return [];
    return (Array.isArray(value) ? value : [value]).map(String).filter(Boolean);
  }

  function toPlainUser(user: any) {
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      displayName: user.displayName,
      profilePictureUrl: user.profilePictureUrl,
      description: user.description,
      broadcasterType: user.broadcasterType,
      creationDate: user.creationDate,
    };
  }

  (TwitchHelixGetUsersNode as any).icon = 'twitch-icon.png';
  RED.nodes.registerType('twitch-helix-get-users', TwitchHelixGetUsersNode as any);
};
