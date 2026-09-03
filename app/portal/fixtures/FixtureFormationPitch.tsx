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

// The header card above this component shares the same width -- see
// FixtureDetailClient -- so the two line up instead of the header
// stretching full-bleed over a much narrower pitch.
const CONTENT_WIDTH_CLASS = "max-w-[850px]";

const BENCH_POSITION_ORDER: Record<string, number> = { G: 0, D: 1, M: 2, F: 3 };

function formatScore(value: number | null): string {
  return value == null ? "-" : value.toFixed(2);
}

function formatMinute(minute: number, addedTime: number | null): string {
  return addedTime ? `${minute}+${addedTime}'` : `${minute}'`;
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
  offInfo,
  axis,
}: {
  positioned: PositionedPlayer;
  fantraxByBsdId: Map<number, FantraxLookupEntry>;
  offInfo: { minute: number; addedTime: number | null } | undefined;
  axis: "horizontal" | "vertical";
}) {
  const { player, alongPct, acrossPct } = positioned;
  const match = fantraxByBsdId.get(player.id);
  const style = axis === "horizontal" ? { left: `${alongPct}%`, top: `${acrossPct}%` } : { left: `${acrossPct}%`, top: `${100 - alongPct}%` };
  const badgeSize = axis === "horizontal" ? "h-8 w-8 text-xs" : "h-5 w-5 text-[9px]";
  const nameSize = axis === "horizontal" ? "max-w-20 text-xs" : "max-w-14 text-[9px]";
  const scoreSize = axis === "horizontal" ? "text-[11px]" : "text-[8px]";
  const offSize = axis === "horizontal" ? "text-[10px]" : "text-[7px]";

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
      {offInfo ? (
        <span className={`font-bold leading-tight text-red-300 drop-shadow ${offSize}`}>&#8595; {formatMinute(offInfo.minute, offInfo.addedTime)}</span>
      ) : null}
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
          axis === "horizontal" ? "h-28 w-28" : "h-24 w-24"
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

function buildOffMinuteMap(substitutions: BsdSubstitution[]): Map<number, { minute: number; addedTime: number | null }> {
  const map = new Map<number, { minute: number; addedTime: number | null }>();
  for (const sub of substitutions) {
    map.set(sub.playerOutId, { minute: sub.minute, addedTime: sub.addedTime });
  }
  return map;
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
  const homeOffMap = buildOffMinuteMap(home.substitutions);
  const awayOffMap = buildOffMinuteMap(away.substitutions);

  return (
    <div
      className={`relative mx-auto w-full overflow-hidden rounded-lg border border-emerald-900 bg-gradient-to-b from-emerald-700 to-emerald-800 ${
        axis === "horizontal" ? "max-w-[810px] aspect-[16/10]" : "max-w-sm aspect-[10/16]"
      }`}
    >
      <PitchMarkings axis={axis} />

      {homePositions.map((positioned) => (
        <PlayerChip
          key={`home-${positioned.player.id}`}
          positioned={positioned}
          fantraxByBsdId={fantraxByBsdId}
          offInfo={homeOffMap.get(positioned.player.id)}
          axis={axis}
        />
      ))}
      {awayPositions.map((positioned) => (
        <PlayerChip
          key={`away-${positioned.player.id}`}
          positioned={positioned}
          fantraxByBsdId={fantraxByBsdId}
          offInfo={awayOffMap.get(positioned.player.id)}
          axis={axis}
        />
      ))}
    </div>
  );
}

function SubsList({ team, fantraxByBsdId }: { team: FormationTeamProps; fantraxByBsdId: Map<number, FantraxLookupEntry> }) {
  if (team.substitutesBench.length === 0) {
    return null;
  }

  const bench = [...team.substitutesBench].sort((a, b) => (BENCH_POSITION_ORDER[a.position] ?? 9) - (BENCH_POSITION_ORDER[b.position] ?? 9));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{team.teamName} substitutes</h3>
      <ul className="mt-1.5 space-y-1">
        {bench.map((player) => {
          const cameOn = team.substitutions.find((sub) => sub.playerInId === player.id);
          const match = fantraxByBsdId.get(player.id);

          return (
            <li key={player.id} className="flex items-center gap-1.5 text-[11px] text-brand-dark">
              <span className="w-4 shrink-0 text-right text-[9px] font-bold text-slate-400">{player.position}</span>
              <span className={`min-w-0 flex-1 truncate ${cameOn ? "" : "text-slate-400"}`}>
                <PlayerName player={player} fantraxByBsdId={fantraxByBsdId} />
              </span>
              {cameOn ? (
                <>
                  <span className="shrink-0 whitespace-nowrap font-bold text-emerald-600">&#8593; {formatMinute(cameOn.minute, cameOn.addedTime)}</span>
                  <span className="shrink-0 whitespace-nowrap text-slate-600">{match ? `${formatScore(match.score)} (${formatScore(match.ghost)})` : "-"}</span>
                </>
              ) : (
                <span className="shrink-0 text-slate-300">-</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function FixtureFormationPitch({ home, away, fantraxByBsdId }: FixtureFormationPitchProps) {
  const hasBench = home.substitutesBench.length > 0 || away.substitutesBench.length > 0;

  return (
    <div className={`space-y-4 rounded-xl border border-slate-200 bg-white p-3 sm:p-4 ${CONTENT_WIDTH_CLASS}`}>
      <div className="hidden md:block">
        <Pitch home={home} away={away} fantraxByBsdId={fantraxByBsdId} axis="horizontal" />
      </div>
      <div className="md:hidden">
        <Pitch home={home} away={away} fantraxByBsdId={fantraxByBsdId} axis="vertical" />
      </div>

      {hasBench ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <SubsList team={home} fantraxByBsdId={fantraxByBsdId} />
          <SubsList team={away} fantraxByBsdId={fantraxByBsdId} />
        </div>
      ) : null}
    </div>
  );
}
