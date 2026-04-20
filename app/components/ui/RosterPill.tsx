import type { LeagueRosterData } from "@/lib/portal/leagueRoster";

type RosterPillProps = {
  playerId: string;
  leagueRoster: LeagueRosterData | null;
};

export default function RosterPill({ playerId, leagueRoster }: RosterPillProps) {
  if (!leagueRoster) return null;

  const teamName = leagueRoster.teamByPlayerId[playerId];

  if (teamName) {
    return (
      <span
        title={teamName}
        className="inline-flex cursor-default rounded px-1.5 py-0.5 text-[10px] font-semibold bg-brand-cream/15 text-brand-cream/55 md:rounded-none md:bg-transparent md:px-0 md:py-0 md:text-[11px] md:text-brand-cream/50"
      >
        Taken
      </span>
    );
  }

  return (
    <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold bg-green-900/50 text-green-400 md:rounded-none md:bg-transparent md:px-0 md:py-0 md:text-[11px]">
      Available
    </span>
  );
}
