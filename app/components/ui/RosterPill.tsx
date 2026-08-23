import type { LeagueRosterData } from "@/lib/portal/leagueRoster";

type RosterPillProps = {
  playerId: string;
  leagueRoster: LeagueRosterData | null;
  variant?: "pill" | "inline";
};

export default function RosterPill({ playerId, leagueRoster, variant = "pill" }: RosterPillProps) {
  if (!leagueRoster) return null;

  const teamName = leagueRoster.teamByPlayerId[playerId];

  if (teamName) {
    if (variant === "inline") {
      return (
        <span title={teamName} className="text-[10px] font-medium text-slate-500">
          Taken
        </span>
      );
    }

    return (
      <span
        title={teamName}
        className="inline-flex cursor-default rounded px-1.5 py-0.5 text-[10px] font-semibold bg-brand-cream/15 text-brand-cream/55 md:rounded-none md:bg-transparent md:px-0 md:py-0 md:text-[11px] md:text-brand-cream/50"
      >
        Taken
      </span>
    );
  }

  if (variant === "inline") {
    return <span className="text-[10px] font-medium text-brand-green">Available</span>;
  }

  return (
    <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold bg-green-900/50 text-green-400 md:rounded-none md:bg-transparent md:px-0 md:py-0 md:text-[11px]">
      Available
    </span>
  );
}
