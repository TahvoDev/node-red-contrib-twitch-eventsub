import type { Node, NodeAPI } from 'node-red';
import {
  applyCommandReply,
  buildCommandTrigger,
  matchCommand,
  messageText,
  type ChatCommandConfig,
  type TwitchChatMessage,
} from './twitch-chat-base';
import { redactError } from '../twitch-shared';

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
      node.error(redactError(err));
      return;
    }

    node.on('input', (msg) => {
      // Same read order as the outbound nodes (messageText): payload first.
      // chat-in emits payload only, so text is just an input alias.
      const text = messageText(msg as TwitchChatMessage);

      const args = matchCommand(text, trigger);
      if (!args) return;

      // These permission checks are the only authorization for the destructive
      // nodes: they act as the configured account and do not re-check the sender.
      // The flags come from the badges twitch-chat-in reads from Twitch, so do
      // not feed this node from a source where untrusted input can set them.
      if (config.requireBroadcaster && !msg.isBroadcaster) return;
      if (config.requireMod && !(msg.isMod || msg.isBroadcaster)) return;
      if (config.requireSub && !msg.isSubscriber) return;
      if (config.requireVip && !msg.isVip) return;

      msg.command = command;
      msg.args = args;
      // Off by default: the downstream reply only threads onto the triggering
      // message when the node is explicitly configured to reply.
      applyCommandReply(msg as TwitchChatMessage, config.reply);
      node.send(msg);
    });
  }

  RED.nodes.registerType('twitch-chat-command', TwitchChatCommandNode as any);
};
