import { getRawData } from '@twurple/common';
import { defineHelix, type HelixField } from '../define';
import { toBool, toIdList, toStr } from '../twitch-helix-utils';

/**
 * The platform/integration long tail: drops entitlements, extensions and
 * content classification labels. These are hidden specs reached through the
 * generic `api request` node, so they do not grow the palette.
 */

const broadcaster: HelixField = {
  name: 'broadcaster',
  label: 'Broadcaster',
  kind: 'user',
  optional: true,
  aliases: ['broadcasterId'],
  hint: 'blank = authenticated user',
  faIcon: 'fa-user',
};

function mapEntitlement(entitlement: any) {
  return {
    id: entitlement.id,
    rewardId: entitlement.rewardId,
    userId: entitlement.userId,
    gameId: entitlement.gameId,
    fulfillmentStatus: entitlement.fulfillmentStatus,
    grantDate: entitlement.grantDate,
    updateDate: entitlement.updateDate,
  };
}

function mapChannelReference(channel: any) {
  return {
    id: channel.id,
    displayName: channel.displayName,
    gameId: channel.gameId,
    gameName: channel.gameName,
    title: channel.title,
  };
}

function mapBitsProduct(product: any) {
  return {
    sku: product.sku,
    cost: product.cost,
    displayName: product.displayName,
    inDevelopment: product.inDevelopment,
    isBroadcast: product.isBroadcast,
    expirationDate: product.expirationDate ?? null,
  };
}

function mapTransaction(transaction: any) {
  return {
    id: transaction.id,
    transactionDate: transaction.transactionDate,
    broadcasterId: transaction.broadcasterId,
    broadcasterName: transaction.broadcasterName,
    userId: transaction.userId,
    userName: transaction.userName,
    productType: transaction.productType,
    productSku: transaction.productSku,
    productCost: transaction.productCost,
    productDisplayName: transaction.productDisplayName,
  };
}

export const platformSpecs = [
  defineHelix({
    type: 'twitch-helix-content-classification-labels',
    tier: 'advanced',
    resource: 'content classification labels',
    palette: false,
    label: 'content classification labels',
    help: "Lists Twitch's content classification labels.",
    scopes: [],
    context: 'app',
    fields: [
      {
        name: 'locale',
        label: 'Locale',
        kind: 'string',
        default: '',
        hint: 'optional: e.g. en-US',
        faIcon: 'fa-globe',
      },
    ],
    run: async ({ api, input }) => api.contentClassificationLabels.getAll(input.locale || undefined),
    map: (label) => ({ id: label.id, name: label.name, description: label.description }),
    extra: (payload) => ({ pagination: { cursor: null }, total: payload.length }),
  }),

  defineHelix({
    type: 'twitch-helix-drops',
    tier: 'advanced',
    resource: 'drops',
    palette: false,
    label: 'drops',
    help: 'Lists or updates drops entitlements.',
    scopes: [],
    context: 'app',
    fields: [],
    defaultAction: 'list',
    actions: {
      list: {
        label: 'list',
        help: 'Lists drops entitlements by user, game or fulfilment status.',
        scopes: [],
        paged: { limit: 20, max: 1000 },
        fields: [
          {
            name: 'user',
            label: 'User',
            kind: 'user',
            optional: true,
            aliases: ['userId'],
            faIcon: 'fa-search',
            hint: 'filter to one user',
          },
          {
            name: 'game',
            label: 'Game ID',
            kind: 'string',
            default: '',
            aliases: ['gameId'],
            faIcon: 'fa-gamepad',
            hint: 'filter to one game ID',
          },
          {
            name: 'status',
            label: 'Status',
            kind: 'select',
            default: '',
            faIcon: 'fa-filter',
            options: [
              { value: '', label: 'any' },
              { value: 'CLAIMED', label: 'claimed' },
              { value: 'FULFILLED', label: 'fulfilled' },
            ],
          },
        ],
        run: async ({ api, input }) =>
          api.entitlements.getDropsEntitlements(
            {
              user: input.user,
              gameId: input.game || undefined,
              fulfillmentStatus: (input.status || undefined) as any,
              limit: input.limit,
              after: input.after,
            },
            true
          ),
        map: (entitlement) => mapEntitlement(entitlement),
      },
      byIds: {
        label: 'by IDs',
        help: 'Gets drops entitlements by their IDs.',
        scopes: [],
        fields: [
          {
            name: 'ids',
            label: 'Entitlement IDs',
            kind: 'idList',
            default: '',
            aliases: ['entitlementIds'],
            primary: true,
            required: true,
            faIcon: 'fa-tags',
            hint: 'comma separated',
          },
        ],
        run: async ({ api, input, msg }) => {
          const ids = toIdList(input.ids ?? msg.ids);
          if (!ids.length) throw new Error('At least one entitlement ID is required');
          return (await api.entitlements.getDropsEntitlementsByIds(ids)).map(mapEntitlement);
        },
      },
      update: {
        label: 'update',
        help: 'Marks one or more drops entitlements as fulfilled or claimed.',
        scopes: [],
        fields: [
          {
            name: 'ids',
            label: 'Entitlement IDs',
            kind: 'idList',
            default: '',
            aliases: ['entitlementIds'],
            primary: true,
            required: true,
            faIcon: 'fa-tags',
            hint: 'comma separated',
          },
          {
            name: 'status',
            label: 'Status',
            kind: 'select',
            default: 'FULFILLED',
            faIcon: 'fa-check',
            options: [
              { value: 'FULFILLED', label: 'fulfilled' },
              { value: 'CLAIMED', label: 'claimed' },
            ],
          },
        ],
        run: async ({ api, input, msg }) => {
          const ids = toIdList(input.ids ?? msg.ids);
          if (!ids.length) throw new Error('At least one entitlement ID is required');
          const status = (toStr(input.status) ?? 'FULFILLED').toUpperCase() as any;
          const result = await api.entitlements.updateDropsEntitlements(ids, status);
          return [...result].map(([id, outcome]: [string, string]) => ({ id, status: outcome }));
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-extensions',
    tier: 'advanced',
    resource: 'extensions',
    palette: false,
    label: 'extensions',
    help: 'Reads released extensions, live channels, bits products and transactions.',
    scopes: [],
    context: 'app',
    fields: [],
    defaultAction: 'released',
    actions: {
      released: {
        label: 'get',
        help: 'Gets a released extension, optionally a specific version.',
        scopes: [],
        fields: [
          {
            name: 'extensionId',
            label: 'Extension ID',
            kind: 'string',
            default: '',
            required: true,
            faIcon: 'fa-puzzle-piece',
            hint: 'the extension client id',
          },
          { name: 'version', label: 'Version', kind: 'string', default: '', hint: 'optional' },
        ],
        run: async ({ api, input }) =>
          (getRawData(await api.extensions.getReleasedExtension(input.extensionId, input.version || undefined)) ?? null),
      },
      live: {
        label: 'live channels',
        help: 'Lists the live channels running an extension.',
        scopes: [],
        paged: { limit: 20, max: 1000 },
        fields: [
          {
            name: 'extensionId',
            label: 'Extension ID',
            kind: 'string',
            default: '',
            required: true,
            faIcon: 'fa-puzzle-piece',
          },
        ],
        run: async ({ api, input }) =>
          api.extensions.getLiveChannelsWithExtension(input.extensionId, {
            limit: input.limit,
            after: input.after,
          }),
        map: (channel) => mapChannelReference(channel),
      },
      bits: {
        label: 'bits products',
        help: 'Lists the Bits products of the extension.',
        scopes: [],
        fields: [
          {
            name: 'includeDisabled',
            label: 'Include disabled',
            kind: 'bool',
            default: false,
            faIcon: 'fa-eye',
          },
        ],
        run: async ({ api, input }) =>
          (await api.extensions.getExtensionBitsProducts(input.includeDisabled === true)).map(mapBitsProduct),
        extra: (payload) => ({ pagination: { cursor: null }, total: payload.length }),
      },
      putBits: {
        label: 'put bits product',
        help: 'Creates or updates an extension Bits product.',
        scopes: [],
        fields: [
          { name: 'sku', label: 'SKU', kind: 'string', default: '', required: true, faIcon: 'fa-barcode' },
          { name: 'cost', label: 'Cost (Bits)', kind: 'int', default: '', required: true, faIcon: 'fa-star' },
          { name: 'displayName', label: 'Display name', kind: 'string', default: '', required: true },
          { name: 'inDevelopment', label: 'In development', kind: 'bool', default: false },
          { name: 'broadcast', label: 'Broadcast', kind: 'bool', default: false },
          { name: 'expirationDate', label: 'Expiration', kind: 'string', default: '', hint: 'optional RFC3339 date' },
        ],
        run: async ({ api, input }) => {
          const product = await api.extensions.putExtensionBitsProduct({
            sku: input.sku,
            cost: input.cost,
            displayName: input.displayName,
            inDevelopment: input.inDevelopment === true,
            broadcast: input.broadcast === true,
            expirationDate: toStr(input.expirationDate),
          });
          return mapBitsProduct(product);
        },
      },
      transactions: {
        label: 'transactions',
        help: 'Lists the Bits transactions of an extension.',
        scopes: [],
        paged: { limit: 20, max: 1000 },
        fields: [
          {
            name: 'extensionId',
            label: 'Extension ID',
            kind: 'string',
            default: '',
            required: true,
            faIcon: 'fa-puzzle-piece',
          },
          {
            name: 'transactionIds',
            label: 'Transaction IDs',
            kind: 'idList',
            default: '',
            aliases: ['ids'],
            hint: 'optional: comma separated',
            faIcon: 'fa-hashtag',
          },
        ],
        run: async ({ api, input }) =>
          api.extensions.getExtensionTransactions(input.extensionId, {
            transactionIds: input.transactionIds?.length ? input.transactionIds : undefined,
            limit: input.limit,
            after: input.after,
          }),
        map: (transaction) => mapTransaction(transaction),
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-user-extensions',
    tier: 'advanced',
    resource: 'extensions',
    palette: false,
    label: 'user extensions',
    help: "Lists the extensions a user has installed or activated.",
    scopes: ['user:read:broadcast'],
    fields: [broadcaster],
    defaultAction: 'installed',
    actions: {
      installed: {
        label: 'installed',
        help: 'Lists the extensions the authenticated user has installed.',
        scopes: ['user:read:broadcast'],
        fields: [
          {
            name: 'withInactive',
            label: 'Include inactive',
            kind: 'bool',
            default: false,
            aliases: ['includeInactive'],
            faIcon: 'fa-eye',
          },
        ],
        run: async ({ api, broadcasterId, input }) =>
          (
            await api.users.getExtensionsForAuthenticatedUser(
              broadcasterId,
              input.withInactive === true
            )
          ).map((extension: any) => getRawData(extension) ?? null),
        extra: (payload) => ({ pagination: { cursor: null }, total: payload.length }),
      },
      active: {
        label: 'active',
        help: 'Gets the active extensions in each slot for the authenticated user.',
        scopes: ['user:read:broadcast'],
        fields: [
          {
            name: 'withDev',
            label: 'Include dev version',
            kind: 'bool',
            default: false,
            faIcon: 'fa-code',
          },
        ],
        run: async ({ api, broadcasterId, input }) =>
          getRawData(await api.users.getActiveExtensions(broadcasterId, input.withDev === true)) ?? null,
      },
    },
  }),
];
