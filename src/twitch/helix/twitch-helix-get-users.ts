module.exports = function(RED) {
  function TwitchHelixGetUsersNode(config) {
    //@ts-expect-error any
    const node = this as any;
    RED.nodes.createNode(node, config);

    node.twitchConfig = RED.nodes.getNode(config.config);

    if (!node.twitchConfig) {
      node.error('No Twitch Eventsub Config node configured');
      return;
    }
    
    const apiClient = node.twitchConfig.apiClient;

    node.on('input', async (msg, send, done) => {
      try {
        const id = msg.id || config.id;
        const login = msg.login || config.login;

        if (!id && !login) {
          throw new Error('No user id or login provided');
        }

        msg.payload = id
          ? await apiClient.users.getUserById(id)
          : await apiClient.users.getUserByName(login);

        send(msg);
        done();
      } catch (err) {
        done(err);
      }
    });
  }

  TwitchHelixGetUsersNode.icon = 'twitch-icon.png';
  RED.nodes.registerType("twitch-helix-get-users", TwitchHelixGetUsersNode);
};
