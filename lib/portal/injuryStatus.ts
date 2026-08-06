export type InjuryStatusIndicator = {
  className: string;
  label: string;
};

export function injuryStatusIndicator(chanceOfPlaying: number | null, status: string | null): InjuryStatusIndicator | null {
  if (chanceOfPlaying == null || chanceOfPlaying === 100) return null;
  if (chanceOfPlaying === 75) return { className: "bg-amber-400 ring-amber-700", label: "Doubtful (75%)" };
  if (chanceOfPlaying === 50) return { className: "bg-amber-500 ring-amber-800", label: "Doubtful (50%)" };
  if (chanceOfPlaying === 25) return { className: "bg-orange-500 ring-orange-800", label: "Doubtful (25%)" };
  if (chanceOfPlaying === 0 && status === "i") return { className: "bg-red-600 ring-red-900", label: "Injured" };
  if (chanceOfPlaying === 0 && status === "s") return { className: "bg-fuchsia-600 ring-fuchsia-900", label: "Suspended" };
  if (chanceOfPlaying === 0 && status === "u") return { className: "bg-slate-500 ring-slate-800", label: "Unavailable" };
  return null;
}
