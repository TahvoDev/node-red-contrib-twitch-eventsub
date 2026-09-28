// Plain-object mappers for Helix results: turn Twurple entities into
// serialisable objects. Shared by the endpoint specs.
import { getRawData } from '@twurple/common';
import { mapEmote, toStr } from '../twitch-helix-utils';

export function mapBlock(block: any) {
  return {
    userId: block.userId,
    userLogin: block.userLogin,
    displayName: block.displayName,
  };
}

export function mapEditor(editor: any) {
  return {
    userId: editor.userId,
    userDisplayName: editor.userDisplayName,
    creationDate: editor.creationDate,
  };
}

export function mapUserEmote(emote: any) {
  return { ...mapEmote(emote), ownerId: emote.ownerId ?? null };
}

export function mapSharedChat(session: any) {
  if (!session) return null;
  return {
    sessionId: session.sessionId,
    hostBroadcasterId: session.hostBroadcasterId,
    participants: (session.participants ?? []).map((participant: any) => {
      const raw = (getRawData(participant) ?? {}) as any;
      return {
        broadcasterId: participant.broadcasterId,
        broadcasterLogin: raw.broadcaster_login ?? null,
        broadcasterName: raw.broadcaster_name ?? null,
      };
    }),
    createdDate: session.createdDate,
    updatedDate: session.updatedDate,
  };
}

export function mapMarker(marker: any) {
  return {
    id: marker.id,
    creationDate: marker.creationDate,
    description: marker.description ?? '',
    positionInSeconds: marker.positionInSeconds,
    url: marker.url ?? null,
    videoId: marker.videoId ?? null,
  };
}

export function mapGame(game: any) {
  return {
    id: game.id,
    name: game.name,
    boxArtUrl: game.boxArtUrl,
    igdbId: game.igdbId ?? null,
  };
}

export function mapClip(clip: any) {
  return {
    id: clip.id,
    url: clip.url,
    embedUrl: clip.embedUrl,
    broadcasterId: clip.broadcasterId,
    broadcasterDisplayName: clip.broadcasterDisplayName,
    creatorId: clip.creatorId,
    creatorDisplayName: clip.creatorDisplayName,
    videoId: clip.videoId,
    gameId: clip.gameId,
    language: clip.language,
    title: clip.title,
    views: clip.views,
    createdAt: clip.creationDate,
    thumbnailUrl: clip.thumbnailUrl,
    duration: clip.duration,
    vodOffset: clip.vodOffset ?? null,
    isFeatured: clip.isFeatured,
  };
}

export function mapVideo(video: any) {
  return {
    id: video.id,
    userId: video.userId,
    userName: video.userName,
    userDisplayName: video.userDisplayName,
    title: video.title,
    description: video.description,
    creationDate: video.creationDate,
    publishDate: video.publishDate,
    url: video.url,
    thumbnailUrl: video.thumbnailUrl,
    isPublic: video.isPublic,
    views: video.views,
    language: video.language,
    type: video.type,
    duration: video.duration,
    durationInSeconds: video.durationInSeconds,
    streamId: video.streamId ?? null,
    mutedSegmentData: video.mutedSegmentData ?? [],
  };
}

export function mapSearchResult(result: any) {
  return {
    id: result.id,
    name: result.name,
    displayName: result.displayName,
    language: result.language,
    gameId: result.gameId,
    gameName: result.gameName,
    isLive: result.isLive,
    tags: result.tags ?? [],
    thumbnailUrl: result.thumbnailUrl,
    startDate: result.startDate ?? null,
  };
}

export function toPlainStream(stream: any) {
  return {
    id: stream.id,
    userId: stream.userId,
    userName: stream.userName,
    userDisplayName: stream.userDisplayName,
    gameId: stream.gameId,
    gameName: stream.gameName,
    type: stream.type,
    title: stream.title,
    viewerCount: stream.viewers,
    startedAt: stream.startDate,
    language: stream.language,
    thumbnailUrl: stream.thumbnailUrl,
    isMature: stream.isMature,
  };
}

export function mapAutoModSettings(settings: any) {
  return {
    broadcasterId: settings.broadcasterId,
    moderatorId: settings.moderatorId,
    overallLevel: settings.overallLevel ?? null,
    disability: settings.disability,
    aggression: settings.aggression,
    sexualitySexOrGender: settings.sexualitySexOrGender,
    misogyny: settings.misogyny,
    bullying: settings.bullying,
    swearing: settings.swearing,
    raceEthnicityOrReligion: settings.raceEthnicityOrReligion,
    sexBasedTerms: settings.sexBasedTerms,
  };
}

export function mapShieldMode(status: any) {
  return {
    isActive: status.isActive,
    moderatorId: status.moderatorId,
    moderatorName: status.moderatorName,
    moderatorDisplayName: status.moderatorDisplayName,
    lastActivationDate: status.lastActivationDate ?? null,
  };
}

export function mapUnbanRequest(request: any) {
  return {
    id: request.id,
    broadcasterId: request.broadcasterId,
    userId: request.userId,
    userName: request.userName,
    userDisplayName: request.userDisplayName,
    moderatorId: request.moderatorId ?? null,
    moderatorDisplayName: request.moderatorDisplayName ?? null,
    message: request.message,
    creationDate: request.creationDate,
    resolutionMessage: request.resolutionMessage ?? null,
    resolutionDate: request.resolutionDate ?? null,
  };
}

export function mapModeratedChannel(channel: any) {
  return { id: channel.id, name: channel.name, displayName: channel.displayName };
}

export function mapBitsEntry(entry: any) {
  return {
    userId: entry.userId,
    userName: entry.userName,
    userDisplayName: entry.userDisplayName,
    rank: entry.rank,
    amount: entry.amount,
  };
}

export function mapGoal(goal: any) {
  return {
    id: goal.id,
    broadcasterId: goal.broadcasterId,
    broadcasterName: goal.broadcasterName,
    broadcasterDisplayName: goal.broadcasterDisplayName,
    type: goal.type,
    description: goal.description,
    currentAmount: goal.currentAmount,
    targetAmount: goal.targetAmount,
    creationDate: goal.creationDate,
  };
}

export function mapTeam(team: any) {
  return {
    id: team.id,
    name: team.name,
    displayName: team.displayName,
    backgroundImageUrl: team.backgroundImageUrl ?? null,
    bannerUrl: team.bannerUrl ?? null,
    creationDate: team.creationDate,
    updateDate: team.updateDate,
    info: team.info,
    logoThumbnailUrl: team.logoThumbnailUrl,
    members: (team.userRelations ?? []).map((relation: any) => ({
      id: relation.id,
      name: relation.name,
      displayName: relation.displayName,
    })),
  };
}

export function mapSegment(segment: any) {
  return {
    id: segment.id,
    startDate: segment.startDate,
    endDate: segment.endDate,
    title: segment.title,
    cancelEndDate: segment.cancelEndDate ?? null,
    categoryId: segment.categoryId ?? null,
    categoryName: segment.categoryName ?? null,
    isRecurring: segment.isRecurring,
  };
}

export function mapSubscription(sub: any) {
  return {
    userId: sub.userId,
    userName: sub.userName,
    userDisplayName: sub.userDisplayName,
    broadcasterId: sub.broadcasterId,
    broadcasterName: sub.broadcasterName,
    broadcasterDisplayName: sub.broadcasterDisplayName,
    gifterId: sub.gifterId ?? null,
    gifterName: sub.gifterName ?? null,
    gifterDisplayName: sub.gifterDisplayName ?? null,
    isGift: sub.isGift,
    tier: sub.tier,
  };
}

export function mapContribution(contribution: any) {
  return {
    userId: contribution.userId,
    type: contribution.type,
    total: contribution.total,
  };
}

export function mapHypeTrainEvent(event: any) {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    eventDate: event.eventDate,
    eventVersion: event.eventVersion,
    id: event.id,
    broadcasterId: event.broadcasterId,
    level: event.level,
    total: event.total,
    goal: event.goal,
    startDate: event.startDate,
    expiryDate: event.expiryDate,
    cooldownDate: event.cooldownDate,
    lastContribution: mapContribution(event.lastContribution),
    topContributions: (event.topContributions ?? []).map(mapContribution),
  };
}

export function mapCharityAmount(amount: any) {
  if (!amount) return null;
  return {
    value: amount.value,
    decimalPlaces: amount.decimalPlaces,
    localizedValue: amount.localizedValue,
    currency: amount.currency,
  };
}

export function mapEntitlement(entitlement: any) {
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

export function mapChannelReference(channel: any) {
  return {
    id: channel.id,
    displayName: channel.displayName,
    gameId: channel.gameId,
    gameName: channel.gameName,
    title: channel.title,
  };
}

export function mapBitsProduct(product: any) {
  return {
    sku: product.sku,
    cost: product.cost,
    displayName: product.displayName,
    inDevelopment: product.inDevelopment,
    isBroadcast: product.isBroadcast,
    expirationDate: product.expirationDate ?? null,
  };
}

export function mapTransaction(transaction: any) {
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

export function imageUrl(reward: any, scale: number): string | null {
  try {
    return typeof reward.getImageUrl === 'function' ? reward.getImageUrl(scale) : null;
  } catch {
    return null;
  }
}

export function mapReward(reward: any) {
  return {
    id: reward.id,
    broadcasterId: reward.broadcasterId,
    broadcasterName: reward.broadcasterName,
    broadcasterDisplayName: reward.broadcasterDisplayName,
    backgroundColor: reward.backgroundColor,
    isEnabled: reward.isEnabled,
    cost: reward.cost,
    title: reward.title,
    prompt: reward.prompt,
    userInputRequired: reward.userInputRequired,
    maxRedemptionsPerStream: reward.maxRedemptionsPerStream ?? null,
    maxRedemptionsPerUserPerStream: reward.maxRedemptionsPerUserPerStream ?? null,
    globalCooldown: reward.globalCooldown ?? null,
    isPaused: reward.isPaused,
    isInStock: reward.isInStock,
    redemptionsThisStream: reward.redemptionsThisStream ?? null,
    autoFulfill: reward.autoFulfill,
    cooldownExpiryDate: reward.cooldownExpiryDate ?? null,
    images: {
      url1x: imageUrl(reward, 1),
      url2x: imageUrl(reward, 2),
      url4x: imageUrl(reward, 4),
    },
  };
}

export function mapRedemption(redemption: any) {
  return {
    id: redemption.id,
    broadcasterId: redemption.broadcasterId,
    broadcasterName: redemption.broadcasterName,
    broadcasterDisplayName: redemption.broadcasterDisplayName,
    userId: redemption.userId,
    userName: redemption.userName,
    userDisplayName: redemption.userDisplayName,
    userInput: redemption.userInput,
    isFulfilled: redemption.isFulfilled,
    isCanceled: redemption.isCanceled,
    redemptionDate: redemption.redemptionDate,
    rewardId: redemption.rewardId,
    rewardTitle: redemption.rewardTitle,
    rewardPrompt: redemption.rewardPrompt,
    rewardCost: redemption.rewardCost,
  };
}

export function mapPoll(poll: any) {
  return {
    id: poll.id,
    broadcasterId: poll.broadcasterId,
    broadcasterName: poll.broadcasterName,
    broadcasterDisplayName: poll.broadcasterDisplayName,
    title: poll.title,
    isChannelPointsVotingEnabled: poll.isChannelPointsVotingEnabled,
    channelPointsPerVote: poll.channelPointsPerVote,
    status: poll.status,
    durationInSeconds: poll.durationInSeconds,
    startDate: poll.startDate,
    endDate: poll.endDate,
    choices: (poll.choices ?? []).map((choice: any) => ({
      id: choice.id,
      title: choice.title,
      totalVotes: choice.totalVotes,
      channelPointsVotes: choice.channelPointsVotes,
    })),
  };
}

export function mapPrediction(prediction: any) {
  return {
    id: prediction.id,
    broadcasterId: prediction.broadcasterId,
    broadcasterName: prediction.broadcasterName,
    broadcasterDisplayName: prediction.broadcasterDisplayName,
    title: prediction.title,
    status: prediction.status,
    autoLockAfter: prediction.autoLockAfter,
    creationDate: prediction.creationDate,
    endDate: prediction.endDate ?? null,
    lockDate: prediction.lockDate ?? null,
    winningOutcomeId: prediction.winningOutcomeId ?? null,
    outcomes: (prediction.outcomes ?? []).map((outcome: any) => ({
      id: outcome.id,
      title: outcome.title,
      users: outcome.users,
      totalChannelPoints: outcome.totalChannelPoints,
      color: outcome.color,
      topPredictors: (outcome.topPredictors ?? []).map((predictor: any) => ({
        userId: predictor.userId,
        userName: predictor.userName,
        userDisplayName: predictor.userDisplayName,
        channelPointsUsed: predictor.channelPointsUsed,
        channelPointsWon: predictor.channelPointsWon ?? null,
      })),
    })),
  };
}

export function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const entry of value) {
      const s = toStr(entry);
      if (s) out.push(s);
    }
    return out;
  }
  const text = toStr(value);
  if (!text) return [];
  return text
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}
