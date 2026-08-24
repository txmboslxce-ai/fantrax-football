export type WatchlistReorderInput = {
  visiblePlayerIds: string[];
  globalWatchlistedPlayerIds: string[];
  currentWatchlistOrders: Map<string, number>;
  activePlayerId: string;
  overPlayerId: string;
};

export type WatchlistReorderResult = {
  needsMaterialization: boolean;
  materializedOrders: Map<string, number>;
  movedPlayerId: string;
  nextWatchlistOrder: number;
  nextOrders: Map<string, number>;
};

function arrayMove<T>(items: T[], oldIndex: number, newIndex: number): T[] {
  const next = [...items];
  const [movedItem] = next.splice(oldIndex, 1);
  next.splice(newIndex, 0, movedItem);
  return next;
}

export function computeWatchlistReorder(input: WatchlistReorderInput): WatchlistReorderResult | null {
  const { activePlayerId, overPlayerId, visiblePlayerIds, globalWatchlistedPlayerIds, currentWatchlistOrders } = input;
  if (activePlayerId === overPlayerId) return null;

  const oldIndex = visiblePlayerIds.findIndex((playerId) => playerId === activePlayerId);
  const newIndex = visiblePlayerIds.findIndex((playerId) => playerId === overPlayerId);
  if (oldIndex < 0 || newIndex < 0) return null;

  const reordered = arrayMove(visiblePlayerIds, oldIndex, newIndex);
  const previousOrders = new Map(currentWatchlistOrders);
  const needsMaterialization = globalWatchlistedPlayerIds.some((playerId) => !previousOrders.has(playerId));
  const materializedOrders = needsMaterialization
    ? new Map(globalWatchlistedPlayerIds.map((playerId, index) => [playerId, (index + 1) * 10]))
    : new Map(previousOrders);
  const movedPlayerId = reordered[newIndex];
  const globalOrderWithoutMoved = globalWatchlistedPlayerIds.filter((playerId) => playerId !== movedPlayerId);
  const nextVisiblePlayerId = reordered[newIndex + 1];
  const previousVisiblePlayerId = reordered[newIndex - 1];
  const nextVisibleGlobalIndex = nextVisiblePlayerId
    ? globalOrderWithoutMoved.findIndex((playerId) => playerId === nextVisiblePlayerId)
    : -1;
  const previousVisibleGlobalIndex = previousVisiblePlayerId
    ? globalOrderWithoutMoved.findIndex((playerId) => playerId === previousVisiblePlayerId)
    : -1;
  const globalAbovePlayerId = nextVisibleGlobalIndex >= 0
    ? globalOrderWithoutMoved[nextVisibleGlobalIndex - 1]
    : previousVisibleGlobalIndex >= 0
      ? globalOrderWithoutMoved[previousVisibleGlobalIndex]
      : undefined;
  const globalBelowPlayerId = nextVisibleGlobalIndex >= 0
    ? globalOrderWithoutMoved[nextVisibleGlobalIndex]
    : previousVisibleGlobalIndex >= 0
      ? globalOrderWithoutMoved[previousVisibleGlobalIndex + 1]
      : undefined;
  const aboveOrder = globalAbovePlayerId ? materializedOrders.get(globalAbovePlayerId) : undefined;
  const belowOrder = globalBelowPlayerId ? materializedOrders.get(globalBelowPlayerId) : undefined;
  const nextWatchlistOrder = aboveOrder == null
    ? (belowOrder == null ? 10 : belowOrder - 10)
    : (belowOrder == null ? aboveOrder + 10 : (aboveOrder + belowOrder) / 2);
  const nextOrders = new Map(materializedOrders);
  nextOrders.set(movedPlayerId, nextWatchlistOrder);

  return {
    needsMaterialization,
    materializedOrders,
    movedPlayerId,
    nextWatchlistOrder,
    nextOrders,
  };
}
