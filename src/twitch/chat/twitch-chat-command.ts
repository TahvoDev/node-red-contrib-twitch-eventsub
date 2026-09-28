import type { Node, NodeAPI } from 'node-red';
import { buildCommandTrigger, matchCommand, type ChatCommandConfig } from './twitch-chat-base';

module.exports = function (RED: NodeAPI) {
  function TwitchChatCommandNode(this: Node, config: ChatCommandConfig) {
    const node = this;
    RED.nodes.createNode(node, config);

    let command: string;
    let trigger: string;
    try {
      ({ name: command, trigger } = buildCommandTrigger(config.prefix, config.command));
    } catch (err) {
      // An unconfigured command would otherwise match every "!" message.
      node.status({ fill: 'red', shape: 'ring', text: 'no command set' });
      node.error((err as Error).message);
      return;
    }

    node.on('input', (msg) => {
      const text =
        typeof msg.text === 'string'
          ? msg.text
          : typeof msg.payload === 'string'
            ? msg.payload
            : '';

      const args = matchCommand(text, trigger);
      if (!args) return;

      // These flags are advisory filters only; the destructive nodes re-check the
      // sender against the Twitch API so a forged flag cannot grant authority.
      if (config.requireBroadcaster && !msg.isBroadcaster) return;
      if (config.requireMod && !(msg.isMod || msg.isBroadcaster)) return;
      if (config.requireSub && !msg.isSubscriber) return;
      if (config.requireVip && !msg.isVip) return;

      msg.command = command;
      msg.args = args;
      node.send(msg);
    });
  }

  RED.nodes.registerType('twitch-chat-command', TwitchChatCommandNode as any);
};
