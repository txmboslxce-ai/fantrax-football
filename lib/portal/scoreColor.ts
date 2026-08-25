// Fixed points-value color scale, so a given score always reads the same color
// everywhere it appears (chips, table cells, etc.) rather than being relative to
// whatever else happens to be on screen. <=3 is "very poor", 20+ is "elite".
const SCORE_COLOR_STOPS: Array<{ value: number; rgb: [number, number, number] }> = [
  { value: 3, rgb: [220, 38, 38] }, // red-600 — very poor
  { value: 6.5, rgb: [194, 65, 12] }, // orange-700 — below par
  { value: 10, rgb: [0, 91, 58] }, // brand green — a solid, happy return
  { value: 20, rgb: [0, 68, 44] }, // brand green (dark) — elite
];

export function scoreColor(points: number): string {
  const stops = SCORE_COLOR_STOPS;
  if (points <= stops[0].value) return `rgb(${stops[0].rgb.join(", ")})`;
  const last = stops[stops.length - 1];
  if (points >= last.value) return `rgb(${last.rgb.join(", ")})`;

  for (let i = 0; i < stops.length - 1; i += 1) {
    const start = stops[i];
    const end = stops[i + 1];
    if (points >= start.value && points <= end.value) {
      const ratio = (points - start.value) / (end.value - start.value);
      const rgb = start.rgb.map((channel, index) => Math.round(channel + (end.rgb[index] - channel) * ratio));
      return `rgb(${rgb.join(", ")})`;
    }
  }
  return `rgb(${last.rgb.join(", ")})`;
}
