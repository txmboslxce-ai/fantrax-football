export type RadarDirection = "higher_is_better" | "lower_is_better";
export type RadarBandShape = "skewed" | "even";

type RankedValue = {
  id: string;
  value: number;
};

const RANK_BANDS = [
  { endRank: 10, minimum: 92, maximum: 100 },
  { endRank: 30, minimum: 75, maximum: 92 },
  { endRank: 60, minimum: 58, maximum: 75 },
  { endRank: 100, minimum: 42, maximum: 58 },
  { endRank: 150, minimum: 25, maximum: 42 },
  { endRank: 200, minimum: 12, maximum: 25 },
  { endRank: 300, minimum: 2, maximum: 12 },
] as const;

const EVEN_RANK_BANDS = [
  { minimum: 92, maximum: 100 },
  { minimum: 75, maximum: 92 },
  { minimum: 58, maximum: 75 },
  { minimum: 42, maximum: 58 },
  { minimum: 25, maximum: 42 },
  { minimum: 8, maximum: 25 },
  { minimum: 0, maximum: 8 },
] as const;

export function rankRadarValues(values: RankedValue[], direction: RadarDirection = "higher_is_better"): Map<string, number> {
  const ranks = new Map<string, number>();
  const sorted = [...values].sort((a, b) => direction === "higher_is_better" ? b.value - a.value : a.value - b.value);

  let index = 0;
  while (index < sorted.length) {
    let end = index + 1;
    while (end < sorted.length && sorted[end].value === sorted[index].value) {
      end += 1;
    }
    // Fractional ("mid") rank: everyone tied at the same value shares the
    // average rank of the whole tied block, not the best rank in it. Without
    // this, a value shared by most of the pool (e.g. "0 goals") would let
    // every one of those players inherit the rank of the best player in that
    // huge tied group, producing an unrealistically high percentile for an
    // extremely common result.
    const averageRank = (index + 1 + end) / 2;
    for (let i = index; i < end; i += 1) {
      ranks.set(sorted[i].id, averageRank);
    }
    index = end;
  }

  return ranks;
}

// A plain percentile (100 = best in the pool, 0 = worst), independent of
// the skewed rank-band scaling below. `rank` may exceed `poolSize` — that's
// the sentinel used for a player who isn't a member of the ranking pool at
// all (e.g. hasn't played), and is clamped to "last place" here rather than
// allowed to go negative.
export function percentileFromRank(rank: number, poolSize: number): number {
  if (poolSize <= 1) return 100;
  const clampedRank = Math.min(Math.max(rank, 1), poolSize);
  return Math.round(((poolSize - clampedRank) / (poolSize - 1)) * 100);
}

export function computeRadarValue(
  rank: number,
  poolSize: number,
  floorRank: number,
  direction: RadarDirection = "higher_is_better",
  bandShape: RadarBandShape = "skewed"
): number {
  // Direction is applied by rankRadarValues before this rank-to-band conversion.
  if (direction !== "higher_is_better" && direction !== "lower_is_better") return 0;

  const effectiveFloorRank = Math.max(1, Math.min(poolSize, floorRank));
  if (rank > effectiveFloorRank) return 0;

  const scaleWithinBand = (startRank: number, endRank: number, minimum: number, maximum: number) => {
    if (endRank <= startRank) return maximum;
    return maximum - ((rank - startRank) / (endRank - startRank)) * (maximum - minimum);
  };

  const bands = bandShape === "even" ? EVEN_RANK_BANDS : RANK_BANDS;
  let startRank = 1;
  for (const [index, band] of bands.entries()) {
    const endRank = bandShape === "even"
      ? Math.max(startRank, Math.round(((index + 1) / bands.length) * effectiveFloorRank))
      : Math.max(startRank, Math.round((RANK_BANDS[index].endRank / 300) * effectiveFloorRank));
    if (rank <= endRank) {
      return scaleWithinBand(startRank, endRank, band.minimum, band.maximum);
    }
    startRank = endRank + 1;
  }

  return 0;
}
