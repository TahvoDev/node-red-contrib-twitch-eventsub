module.exports = function (RED) {
  function TwitchHelixGetUsersNode(config) {
    // @ts-expect-error any
    const node = this;
    RED.nodes.createNode(node, config);

    node.twitchConfig = RED.nodes.getNode(config.config);
    if (!node.twitchConfig) {
      node.error('No Twitch Config node configured');
      return;
    }


    node.on('input', async (msg, send, done) => {

      const apiClient = node.twitchConfig.apiClient;

      if (!apiClient) {
        done(new Error('Twitch API not ready yet — is the config node connected?'));
        return;
      }

      try {
        const payload = msg.payload ?? {};

        // Coerce userId/userIds into a single array
        const ids = toArray(payload.userId ?? payload.userIds ?? config.userId);
        // Coerce login/logins into a single array
        const logins = toArray(payload.login ?? payload.logins ?? config.login);

        if (ids.length) {
          const result = ids.length === 1
          ? await apiClient.users.getUserById(ids[0])
          : await apiClient.users.getUsersByIds(ids);
          msg.payload = Array.isArray(result) ? result.map(toPlainUser) : toPlainUser(result);
        } else if (logins.length) {
          const result = logins.length === 1
          ? await apiClient.users.getUserByName(logins[0])
          : await apiClient.users.getUsersByNames(logins);
          msg.payload = Array.isArray(result) ? result.map(toPlainUser) : toPlainUser(result);
        }

        send(msg);
        done();
      } catch (err) {
        done(err);
      }
    });
  }

  // Coerce a value into a non-empty array of strings, filtering blanks
  function toArray(value) {
    if (!value) return [];
    const arr = Array.isArray(value) ? value : [value];
    return arr.map(String).filter(Boolean);
  }

  function toPlainUser(user) {
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

  TwitchHelixGetUsersNode.icon = 'twitch-icon.png';
  RED.nodes.registerType('twitch-helix-get-users', TwitchHelixGetUsersNode);
};
