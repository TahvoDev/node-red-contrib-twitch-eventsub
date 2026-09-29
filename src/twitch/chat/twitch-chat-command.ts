import type { Node, NodeAPI } from 'node-red';
import {
  buildCommandTrigger,
  getChatConnection,
  matchCommand,
  verifyChatRole,
  type ChatCommandConfig,
  type TwitchChatMessage,
} from './twitch-chat-base';
import { sanitizeText } from '../../security';

module.exports = function (RED: NodeAPI) {
  function TwitchChatCommandNode(this: Node, config: ChatCommandConfig) {
    const node = this;
    RED.nodes.createNode(node, config);

    const connection = getChatConnection(RED, config);
    const wantsRole = Boolean(
      config.requireBroadcaster || config.requireMod || config.requireSub || config.requireVip
    );
    if (wantsRole && !connection) {
      // Without a connection the role flags are the only gate, and any upstream
      // node can set them. Warn once so the flow author can wire one in.
      node.warn(
        'Permission checks are unverified: set a Connection on this node so roles are checked against Twitch.'
      );
    }

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

    node.on('input', async (msg: TwitchChatMessage) => {
      const raw =
        typeof msg.text === 'string'
          ? msg.text
          : typeof msg.payload === 'string'
            ? msg.payload
            : '';

      // Cap before the match/split: msg.text is an untrusted, possibly huge value.
      const args = matchCommand(sanitizeText(raw, 4000), trigger);
      if (!args) return;

      if (wantsRole) {
        if (connection) {
          // Verified against Twitch: msg.isMod/isBroadcaster/isSubscriber/isVip
          // are ignored, so an upstream node cannot forge the role.
          if (!(await verifyChatRole(connection, config, msg))) return;
        } else {
          // Legacy fallback (no connection configured). Unverified by design —
          // see the warning above and SECURITY.md.
          if (config.requireBroadcaster && !msg.isBroadcaster) return;
          if (config.requireMod && !(msg.isMod || msg.isBroadcaster)) return;
          if (config.requireSub && !msg.isSubscriber) return;
          if (config.requireVip && !msg.isVip) return;
        }
      }

      // The args are still attacker text: strip control/bidi/zero-width and cap
      // each before they are handed to a downstream node.
      msg.command = command;
      msg.args = args.map((arg) => sanitizeText(arg, 100));
      node.send(msg);
    });
  }

  RED.nodes.registerType('twitch-chat-command', TwitchChatCommandNode as any);
};
