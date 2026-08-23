export function positionBadgeClass(position: string): string {
  const key = position.trim().charAt(0).toUpperCase();

  if (key === "G") return "bg-amber-100 text-amber-900";
  if (key === "D") return "bg-emerald-200 text-emerald-950";
  if (key === "M") return "bg-violet-200 text-violet-950";
  if (key === "F") return "bg-orange-200 text-orange-950";
  return "bg-violet-200 text-violet-950";
}
