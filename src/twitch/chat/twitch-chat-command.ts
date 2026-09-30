import type { Node, NodeAPI } from 'node-red';
import {
  buildCommandTrigger,
  getChatConnection,
  matchCommand,
  normalizeChannel,
  verifyChatRole,
  type ChatCommandConfig,
  type TwitchChatMessage,
} from './twitch-chat-base';

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

    let warnedNoChannel = false;

    const handle = async (msg: TwitchChatMessage): Promise<void> => {
      const raw =
        typeof msg.text === 'string'
          ? msg.text
          : typeof msg.payload === 'string'
            ? msg.payload
            : '';

      const args = matchCommand(raw, trigger);
      if (!args) return;

      if (wantsRole) {
        if (connection) {
          // The verified check needs a channel to resolve the broadcaster. If an
          // upstream node dropped msg.channel the check fails closed, which would
          // otherwise silently swallow every message — say so once.
          if (!normalizeChannel(msg.channel ?? config.channel)) {
            if (!warnedNoChannel) {
              warnedNoChannel = true;
              node.warn(
                'Permission checks are being skipped: set a Channel on this node (or keep msg.channel) so the sender can be verified.'
              );
            }
            return;
          }
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

      msg.command = command;
      msg.args = args;
      node.send(msg);
    };

    // Run one message at a time: the verified role check is async, so without
    // this a later message could overtake an earlier one, and a rejection would
    // escape the Node-RED input handler and take the runtime down.
    let chain: Promise<void> = Promise.resolve();
    node.on('input', (msg: TwitchChatMessage) => {
      chain = chain
        .then(() => handle(msg))
        .catch((err) => node.error(err as Error, msg));
    });
  }

  RED.nodes.registerType('twitch-chat-command', TwitchChatCommandNode as any);
};
