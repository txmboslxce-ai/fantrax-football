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
  let rank = 0;
  let previousValue: number | undefined;

  [...values]
    .sort((a, b) => direction === "higher_is_better" ? b.value - a.value : a.value - b.value)
    .forEach((entry, index) => {
      if (index === 0 || entry.value !== previousValue) {
        rank = index + 1;
        previousValue = entry.value;
      }
      ranks.set(entry.id, rank);
    });

  return ranks;
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
