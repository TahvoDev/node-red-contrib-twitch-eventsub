import type { Node, NodeAPI } from 'node-red';
import type { ChatCommandConfig } from './twitch-chat-base';

module.exports = function (RED: NodeAPI) {
  function TwitchChatCommandNode(this: Node, config: ChatCommandConfig) {
    const node = this;
    RED.nodes.createNode(node, config);

    const prefix = config.prefix || '!';
    const command = String(config.command ?? '');
    const trigger = `${prefix}${command}`.toLowerCase();

    node.on('input', (msg) => {
      const text =
        typeof msg.text === 'string'
          ? msg.text
          : typeof msg.payload === 'string'
            ? msg.payload
            : '';

      if (!text.toLowerCase().startsWith(trigger)) return;

      if (config.requireBroadcaster && !msg.isBroadcaster) return;
      if (config.requireMod && !(msg.isMod || msg.isBroadcaster)) return;
      if (config.requireSub && !msg.isSubscriber) return;
      if (config.requireVip && !msg.isVip) return;

      msg.command = command;
      msg.args = text
        .slice(trigger.length)
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      node.send(msg);
    });
  }

  RED.nodes.registerType('twitch-chat-command', TwitchChatCommandNode as any);
};
