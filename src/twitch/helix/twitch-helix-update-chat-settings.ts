import type { NodeAPI } from 'node-red';
import { createHelixNode } from './twitch-helix-base';
import {
  authUserId,
  firstDefined,
  mapChatSettings,
  requireScopes,
  resolveBroadcaster,
  toBool,
  toInt,
} from './twitch-helix-utils';

module.exports = function (RED: NodeAPI) {
  function TwitchHelixUpdateChatSettingsNode(this: any, config: any) {
    createHelixNode(RED, this, config, async (apiClient, msg, nodeConfig, twitchConfig) => {
      requireScopes(twitchConfig, ['moderator:manage:chat_settings']);

      const broadcasterId = await resolveBroadcaster(apiClient, msg, nodeConfig, twitchConfig);
      const moderatorId = authUserId(twitchConfig);

      const settings: any = {};
      const flag = (key: string, value: unknown) => {
        const b = toBool(value);
        if (b !== undefined) settings[key] = b;
      };
      const num = (key: string, value: unknown) => {
        const n = toInt(value);
        if (n !== undefined) settings[key] = n;
      };

      flag('slowModeEnabled', firstDefined(msg.slowMode, nodeConfig.slowMode));
      num('slowModeDelay', firstDefined(msg.slowModeDelay, nodeConfig.slowModeDelay));
      flag('followerOnlyModeEnabled', firstDefined(msg.followerOnlyMode, nodeConfig.followerOnlyMode));
      num('followerOnlyModeDelay', firstDefined(msg.followerOnlyModeDelay, nodeConfig.followerOnlyModeDelay));
      flag('subscriberOnlyModeEnabled', firstDefined(msg.subscriberOnlyMode, nodeConfig.subscriberOnlyMode));
      flag('emoteOnlyModeEnabled', firstDefined(msg.emoteOnlyMode, nodeConfig.emoteOnlyMode));
      flag('uniqueChatModeEnabled', firstDefined(msg.uniqueChatMode, nodeConfig.uniqueChatMode));
      flag('nonModeratorChatDelayEnabled', firstDefined(msg.nonModeratorChatDelay, nodeConfig.nonModeratorChatDelay));
      num('nonModeratorChatDelay', firstDefined(msg.nonModeratorChatDelayDuration, nodeConfig.nonModeratorChatDelayDuration));

      if (Object.keys(settings).length === 0) {
        throw new Error('Nothing to update — set at least one chat setting');
      }

      const updated = await apiClient.asUser(moderatorId, (ctx: any) =>
        ctx.chat.updateSettings(broadcasterId, settings)
      );

      return mapChatSettings(updated, true);
    });
  }

  (TwitchHelixUpdateChatSettingsNode as any).icon = 'twitch-icon.svg';
  RED.nodes.registerType('twitch-helix-update-chat-settings', TwitchHelixUpdateChatSettingsNode as any);
};
