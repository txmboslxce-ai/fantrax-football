type ColorStop = { value: number; rgb: [number, number, number] };

function interpolateColor(value: number, stops: ColorStop[]): string {
  if (value <= stops[0].value) return `rgb(${stops[0].rgb.join(", ")})`;
  const last = stops[stops.length - 1];
  if (value >= last.value) return `rgb(${last.rgb.join(", ")})`;

  for (let i = 0; i < stops.length - 1; i += 1) {
    const start = stops[i];
    const end = stops[i + 1];
    if (value >= start.value && value <= end.value) {
      const ratio = (value - start.value) / (end.value - start.value);
      const rgb = start.rgb.map((channel, index) => Math.round(channel + (end.rgb[index] - channel) * ratio)) as [
        number,
        number,
        number,
      ];
      return `rgb(${rgb.join(", ")})`;
    }
  }
  return `rgb(${last.rgb.join(", ")})`;
}

// Fixed points-value color scale, so a given score always reads the same color
// everywhere it appears (chips, table cells, etc.) rather than being relative to
// whatever else happens to be on screen. <=3 is "very poor", 20+ is "elite".
const SCORE_COLOR_STOPS: ColorStop[] = [
  { value: 3, rgb: [220, 38, 38] }, // red-600 — very poor
  { value: 6.5, rgb: [194, 65, 12] }, // orange-700 — below par
  { value: 10, rgb: [0, 91, 58] }, // brand green — a solid, happy return
  { value: 20, rgb: [0, 68, 44] }, // brand green (dark) — elite
];

export function scoreColor(points: number): string {
  return interpolateColor(points, SCORE_COLOR_STOPS);
}

// Same visual language as scoreColor, but for a 0-100 percentile rank rather
// than a raw fantasy-points value. 0 = bottom of the pool, 100 = best.
const PERCENTILE_COLOR_STOPS: ColorStop[] = [
  { value: 0, rgb: [220, 38, 38] }, // red-600 — bottom of the pool
  { value: 35, rgb: [194, 65, 12] }, // orange-700 — below average
  { value: 65, rgb: [0, 91, 58] }, // brand green — above average
  { value: 100, rgb: [0, 68, 44] }, // brand green (dark) — elite
];

export function percentileColor(percentile: number): string {
  return interpolateColor(percentile, PERCENTILE_COLOR_STOPS);
}
