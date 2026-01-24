module.exports = function (RED) {
  function TwitchHelixGetUsersNode(config) {
    // @ts-expect-error any
    const node = this;
    RED.nodes.createNode(node, config);

    node.twitchConfig = RED.nodes.getNode(config.config);

    if (!node.twitchConfig) {
      node.error('No Twitch Eventsub Config node configured');
      return;
    }

    const apiClient = node.twitchConfig.apiClient;

    node.on('input', async (msg, send, done) => {
      try {
        const userId = msg.userId || config.userId;
        const login = msg.login || config.login;

        if (!userId && !login) {
          throw new Error('No userId or login provided');
        }

        msg.payload = userId
          ? await apiClient.users.getUserById(userId)
          : await apiClient.users.getUserByName(login);

        send(msg);
        done();
      } catch (err) {
        done(err);
      }
    });
  }

  TwitchHelixGetUsersNode.icon = 'twitch-icon.png';
  RED.nodes.registerType('twitch-helix-get-users', TwitchHelixGetUsersNode);
};
