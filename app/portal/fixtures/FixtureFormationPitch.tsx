import Link from "next/link";
import type { BsdLineupPlayer, BsdSubstitution } from "@/lib/bsd/lineups";
import { layoutTeam, type PositionedPlayer } from "@/lib/portal/formationLayout";
import { positionBadgeClass } from "@/lib/portal/positionBadge";

export type FantraxLookupEntry = {
  fantraxId: string;
  score: number | null;
  ghost: number | null;
};

export type FormationTeamProps = {
  teamName: string;
  lines: BsdLineupPlayer[][];
  substitutions: BsdSubstitution[];
  substitutesBench: BsdLineupPlayer[];
};

type FixtureFormationPitchProps = {
  home: FormationTeamProps;
  away: FormationTeamProps;
  fantraxByBsdId: Map<number, FantraxLookupEntry>;
};

function formatScore(value: number | null): string {
  return value == null ? "-" : value.toFixed(2);
}

function PlayerName({ player, fantraxByBsdId }: { player: BsdLineupPlayer; fantraxByBsdId: Map<number, FantraxLookupEntry> }) {
  const match = fantraxByBsdId.get(player.id);
  if (!match) {
    return <>{player.shortName}</>;
  }
  return (
    <Link href={`/portal/players/${match.fantraxId}`} className="font-semibold hover:underline">
      {player.shortName}
    </Link>
  );
}

function PlayerChip({
  positioned,
  fantraxByBsdId,
  axis,
}: {
  positioned: PositionedPlayer;
  fantraxByBsdId: Map<number, FantraxLookupEntry>;
  axis: "horizontal" | "vertical";
}) {
  const { player, alongPct, acrossPct } = positioned;
  const match = fantraxByBsdId.get(player.id);
  const style = axis === "horizontal" ? { left: `${alongPct}%`, top: `${acrossPct}%` } : { left: `${acrossPct}%`, top: `${100 - alongPct}%` };

  return (
    <div className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 text-center" style={style}>
      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold shadow ${positionBadgeClass(player.position)}`}>
        {player.jerseyNumber}
      </span>
      <span className="max-w-14 truncate text-[9px] leading-tight text-white drop-shadow">
        <PlayerName player={player} fantraxByBsdId={fantraxByBsdId} />
      </span>
      <span className="text-[8px] font-semibold leading-tight text-white/90 drop-shadow">
        {match ? `${formatScore(match.score)} (${formatScore(match.ghost)})` : "-"}
      </span>
    </div>
  );
}

function Pitch({
  home,
  away,
  fantraxByBsdId,
  axis,
}: {
  home: FormationTeamProps;
  away: FormationTeamProps;
  fantraxByBsdId: Map<number, FantraxLookupEntry>;
  axis: "horizontal" | "vertical";
}) {
  const homePositions = layoutTeam(home.lines, true);
  const awayPositions = layoutTeam(away.lines, false);

  return (
    <div
      className={`relative mx-auto w-full overflow-hidden rounded-lg border border-emerald-900 bg-gradient-to-b from-emerald-700 to-emerald-800 ${
        axis === "horizontal" ? "max-w-xl aspect-[16/10]" : "max-w-xs aspect-[10/16]"
      }`}
    >
      {axis === "horizontal" ? (
        <>
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/30" />
          <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30" />
        </>
      ) : (
        <>
          <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/30" />
          <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30" />
        </>
      )}

      {homePositions.map((positioned) => (
        <PlayerChip key={`home-${positioned.player.id}`} positioned={positioned} fantraxByBsdId={fantraxByBsdId} axis={axis} />
      ))}
      {awayPositions.map((positioned) => (
        <PlayerChip key={`away-${positioned.player.id}`} positioned={positioned} fantraxByBsdId={fantraxByBsdId} axis={axis} />
      ))}
    </div>
  );
}

function SubsList({ team, fantraxByBsdId }: { team: FormationTeamProps; fantraxByBsdId: Map<number, FantraxLookupEntry> }) {
  if (team.substitutions.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-bold text-brand-dark">{team.teamName} substitutes</h3>
      <ul className="mt-2 space-y-1.5 text-sm">
        {team.substitutions.map((sub) => {
          const incoming = team.substitutesBench.find((player) => player.id === sub.playerInId);
          const match = incoming ? fantraxByBsdId.get(incoming.id) : undefined;
          const minuteLabel = sub.addedTime ? `${sub.minute}+${sub.addedTime}'` : `${sub.minute}'`;

          return (
            <li key={`${sub.playerInId}-${sub.minute}`} className="flex flex-wrap items-baseline gap-x-1.5 text-brand-dark">
              {incoming ? (
                <PlayerName player={incoming} fantraxByBsdId={fantraxByBsdId} />
              ) : (
                <span className="font-semibold">{sub.playerInName}</span>
              )}
              <span className="text-slate-600">
                {match ? `${formatScore(match.score)} (${formatScore(match.ghost)})` : "-"}
              </span>
              <span className="text-xs text-slate-500">
                ({minuteLabel} for {sub.playerOutName}
                {incoming ? `, ${incoming.position}` : ""})
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function FixtureFormationPitch({ home, away, fantraxByBsdId }: FixtureFormationPitchProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
        <div className="hidden md:block">
          <Pitch home={home} away={away} fantraxByBsdId={fantraxByBsdId} axis="horizontal" />
        </div>
        <div className="md:hidden">
          <Pitch home={home} away={away} fantraxByBsdId={fantraxByBsdId} axis="vertical" />
        </div>
      </div>

      {home.substitutions.length > 0 || away.substitutions.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SubsList team={home} fantraxByBsdId={fantraxByBsdId} />
          <SubsList team={away} fantraxByBsdId={fantraxByBsdId} />
        </div>
      ) : null}
    </div>
  );
}
