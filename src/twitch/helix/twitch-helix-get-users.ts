import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixGetUsersNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg) => {

      // Extract explicit inputs from msg properties or fallback to separate node configs
      const ids = parseQueryInput(msg.userId ?? msg.userIds ?? config.userIds);
      const logins = parseQueryInput(msg.login ?? msg.logins ?? config.logins);

      if (!ids.length && !logins.length) {
        throw new Error('No user query provided. Please fill out either User IDs or Usernames.');
      }

      let usersFromIds: any[] = [];
      let usersFromLogins: any[] = [];

      // 1. Process explicit User IDs strictly as IDs
      if (ids.length) {
        const res = ids.length === 1
        ? await apiClient.users.getUserById(ids[0])
        : await apiClient.users.getUsersByIds(ids);
        if (res) usersFromIds = Array.isArray(res) ? res : [res];
      }

      // 2. Process explicit Usernames strictly as Logins
      if (logins.length) {
        const res = logins.length === 1
        ? await apiClient.users.getUserByName(logins[0])
        : await apiClient.users.getUsersByNames(logins);
        if (res) usersFromLogins = Array.isArray(res) ? res : [res];
      }

      // 3. Combine both source arrays into one unified list
      const combinedUsers = [...usersFromIds, ...usersFromLogins];

      // Deduplicate results using a Set tracking unique Twitch user IDs
      const seenIds = new Set();
      const plainUsers = combinedUsers
      .map(toPlainUser)
      .filter(user => {
        if (!user || seenIds.has(user.id)) return false;
        seenIds.add(user.id);
        return true;
      });

      if (plainUsers.length === 0) {
        throw new Error('No matching users could be found on Twitch.');
      }

      // If only one unique user was resolved across all queries, return that object; otherwise return the merged array
      return plainUsers.length === 1 ? plainUsers[0] : plainUsers;
    });
  }

  function parseQueryInput(value: any): string[] {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.map(String).map(s => s.trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [String(value).trim()].filter(Boolean);
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

  (TwitchHelixGetUsersNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-get-users', TwitchHelixGetUsersNode as any);
};
