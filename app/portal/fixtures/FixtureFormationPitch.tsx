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
  const badgeSize = axis === "horizontal" ? "h-8 w-8 text-xs" : "h-5 w-5 text-[9px]";
  const nameSize = axis === "horizontal" ? "max-w-20 text-xs" : "max-w-14 text-[9px]";
  const scoreSize = axis === "horizontal" ? "text-[11px]" : "text-[8px]";

  return (
    <div className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 text-center" style={style}>
      <span className={`flex items-center justify-center rounded-full font-bold shadow ${badgeSize} ${positionBadgeClass(player.position)}`}>
        {player.jerseyNumber}
      </span>
      <span className={`truncate leading-tight text-white drop-shadow ${nameSize}`}>
        <PlayerName player={player} fantraxByBsdId={fantraxByBsdId} />
      </span>
      <span className={`font-semibold leading-tight text-white/90 drop-shadow ${scoreSize}`}>
        {match ? `${formatScore(match.score)} (${formatScore(match.ghost)})` : "-"}
      </span>
    </div>
  );
}

type Axis = "horizontal" | "vertical";

// Converts a rectangle defined in along/across percentages (goal-to-goal,
// touchline-to-touchline) into real left/top/width/height for whichever
// orientation is rendering -- the same along/across coordinate space
// PositionedPlayer uses, just for a box instead of a point.
function rectStyle(alongRange: [number, number], acrossRange: [number, number], axis: Axis) {
  const [alongMin, alongMax] = alongRange;
  const [acrossMin, acrossMax] = acrossRange;

  if (axis === "horizontal") {
    return { left: `${alongMin}%`, width: `${alongMax - alongMin}%`, top: `${acrossMin}%`, height: `${acrossMax - acrossMin}%` };
  }
  return { left: `${acrossMin}%`, width: `${acrossMax - acrossMin}%`, top: `${100 - alongMax}%`, height: `${alongMax - alongMin}%` };
}

function PitchMarkings({ axis }: { axis: Axis }) {
  const lineClass = "absolute border border-white/40";

  return (
    <>
      <div className={`${lineClass} inset-[3%]`} />
      <div className={`absolute bg-white/40 ${axis === "horizontal" ? "left-1/2 top-[3%] h-[94%] w-px -translate-x-1/2" : "left-[3%] top-1/2 h-px w-[94%] -translate-y-1/2"}`} />
      <div
        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40 ${
          axis === "horizontal" ? "h-40 w-40" : "h-24 w-24"
        }`}
      />
      <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/40" />

      {/* Penalty + six-yard boxes at both ends */}
      <div className={lineClass} style={rectStyle([3, 19], [21, 79], axis)} />
      <div className={lineClass} style={rectStyle([81, 97], [21, 79], axis)} />
      <div className={lineClass} style={rectStyle([3, 9], [38, 62], axis)} />
      <div className={lineClass} style={rectStyle([91, 97], [38, 62], axis)} />
    </>
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
  axis: Axis;
}) {
  const homePositions = layoutTeam(home.lines, true);
  const awayPositions = layoutTeam(away.lines, false);

  return (
    <div
      className={`relative mx-auto w-full overflow-hidden rounded-lg border border-emerald-900 bg-gradient-to-b from-emerald-700 to-emerald-800 ${
        axis === "horizontal" ? "max-w-6xl aspect-[16/10]" : "max-w-sm aspect-[10/16]"
      }`}
    >
      <PitchMarkings axis={axis} />

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
  const hasSubs = home.substitutions.length > 0 || away.substitutions.length > 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      {/* Below xl: pitch full width (orientation swaps at md), subs stacked below */}
      <div className="space-y-4 xl:hidden">
        <div className="hidden md:block">
          <Pitch home={home} away={away} fantraxByBsdId={fantraxByBsdId} axis="horizontal" />
        </div>
        <div className="md:hidden">
          <Pitch home={home} away={away} fantraxByBsdId={fantraxByBsdId} axis="vertical" />
        </div>

        {hasSubs ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <SubsList team={home} fantraxByBsdId={fantraxByBsdId} />
            <SubsList team={away} fantraxByBsdId={fantraxByBsdId} />
          </div>
        ) : null}
      </div>

      {/* xl+: enough room for the subs to sit beside the pitch instead of below it */}
      <div className="hidden xl:grid xl:grid-cols-[minmax(0,1fr)_260px] xl:items-start xl:gap-4">
        <Pitch home={home} away={away} fantraxByBsdId={fantraxByBsdId} axis="horizontal" />
        {hasSubs ? (
          <div className="flex flex-col gap-4">
            <SubsList team={home} fantraxByBsdId={fantraxByBsdId} />
            <SubsList team={away} fantraxByBsdId={fantraxByBsdId} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
