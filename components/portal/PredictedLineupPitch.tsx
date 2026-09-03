import Link from "next/link";
import AvailabilityIcon from "@/app/components/ui/AvailabilityIcon";
import { layoutPredictedTeam } from "@/lib/rotowire/pitchLayout";

export type PredictedLineupPlayer = {
  id: string;
  name: string;
  position: string | null;
  chanceOfPlaying: number | null;
  availabilityStatus: string | null;
  availabilityNews: string | null;
};

export type PredictedInjuryPlayer = {
  id: string;
  name: string;
  status: string;
};

export type PredictedLineupTeam = {
  teamLabel: string;
  players: PredictedLineupPlayer[];
  injuries: PredictedInjuryPlayer[];
};

type PredictedLineupPitchProps = {
  home: PredictedLineupTeam;
  away: PredictedLineupTeam;
};

const CONTENT_WIDTH_CLASS = "max-w-[850px]";

function positionOf(player: PredictedLineupPlayer): string | null {
  return player.position;
}

// Names get cramped fast at pitch-chip scale -- last name only, full name
// still available on hover via the title attribute. A bare last token would
// cut "Virgil van Dijk" down to just "Dijk" -- these lowercase connective
// particles are part of the surname, so keep any of them immediately
// preceding the final (capitalized) token attached to it. Matched
// case-insensitively since some records capitalize them ("Van Dijk") and
// some don't ("van Dijk").
const SURNAME_PARTICLES = new Set([
  "van", "der", "den", "de", "di", "da", "dos", "das", "von", "el", "al", "st", "st.", "la", "le", "du",
]);

function lastName(fullName: string): string {
  const tokens = fullName.trim().split(/\s+/);
  if (tokens.length <= 1) {
    return fullName;
  }

  let start = tokens.length - 1;
  while (start > 0 && SURNAME_PARTICLES.has(tokens[start - 1].toLowerCase())) {
    start -= 1;
  }

  return tokens.slice(start).join(" ");
}

function PlayerChip({
  positioned,
  axis,
}: {
  positioned: { player: PredictedLineupPlayer; alongPct: number; acrossPct: number };
  axis: "horizontal" | "vertical";
}) {
  const { player, alongPct, acrossPct } = positioned;
  const style = axis === "horizontal" ? { left: `${alongPct}%`, top: `${acrossPct}%` } : { left: `${acrossPct}%`, top: `${100 - alongPct}%` };
  const badgeSize = axis === "horizontal" ? "h-8 w-8 text-xs" : "h-6 w-6 text-[9px]";
  const nameSize = axis === "horizontal" ? "max-w-20 text-xs" : "max-w-14 text-[9px]";

  return (
    <div className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 text-center" style={style} title={player.name}>
      <span className="relative">
        <Link
          href={`/portal/players/${player.id}`}
          prefetch={false}
          className={`flex items-center justify-center rounded-full border-2 border-white bg-brand-dark font-bold text-brand-cream shadow transition-colors hover:bg-brand-greenLight ${badgeSize}`}
        >
          {player.position ?? ""}
        </Link>
        <span className="absolute -right-1.5 -top-1.5">
          <AvailabilityIcon chanceOfPlaying={player.chanceOfPlaying} status={player.availabilityStatus} news={player.availabilityNews} />
        </span>
      </span>
      <span className={`truncate leading-tight text-white drop-shadow ${nameSize}`}>{lastName(player.name)}</span>
    </div>
  );
}

type Axis = "horizontal" | "vertical";

// Same coordinate-to-CSS mapping as FixtureFormationPitch's rectStyle --
// converts an along/across percentage rectangle into real left/top/width/
// height for whichever orientation is rendering.
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

      <div className={lineClass} style={rectStyle([3, 19], [21, 79], axis)} />
      <div className={lineClass} style={rectStyle([81, 97], [21, 79], axis)} />
      <div className={lineClass} style={rectStyle([3, 9], [38, 62], axis)} />
      <div className={lineClass} style={rectStyle([91, 97], [38, 62], axis)} />
    </>
  );
}

function Pitch({ home, away, axis }: { home: PredictedLineupTeam; away: PredictedLineupTeam; axis: Axis }) {
  const homePositions = layoutPredictedTeam(home.players, positionOf, true);
  const awayPositions = layoutPredictedTeam(away.players, positionOf, false);

  return (
    <div
      className={`relative mx-auto w-full overflow-hidden rounded-lg border border-emerald-900 bg-gradient-to-b from-emerald-700 to-emerald-800 ${
        axis === "horizontal" ? "max-w-[810px] aspect-[16/10]" : "max-w-sm aspect-[10/16]"
      }`}
    >
      <PitchMarkings axis={axis} />

      {homePositions.length === 0 && awayPositions.length === 0 ? (
        <p className="absolute inset-0 flex items-center justify-center text-center text-xs font-semibold text-white/80">
          Not yet available
        </p>
      ) : (
        <>
          {homePositions.map((positioned) => (
            <PlayerChip key={`home-${positioned.player.id}`} positioned={positioned} axis={axis} />
          ))}
          {awayPositions.map((positioned) => (
            <PlayerChip key={`away-${positioned.player.id}`} positioned={positioned} axis={axis} />
          ))}
        </>
      )}
    </div>
  );
}

function InjuriesList({ team }: { team: PredictedLineupTeam }) {
  if (team.injuries.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{team.teamLabel} injuries</h3>
      <ul className="mt-1.5 space-y-1">
        {team.injuries.map((player) => (
          <li key={player.id} className="flex items-center justify-between gap-2 text-[11px] text-brand-dark">
            <Link href={`/portal/players/${player.id}`} prefetch={false} title={player.name} className="min-w-0 flex-1 truncate hover:underline">
              {lastName(player.name)}
            </Link>
            <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-800">{player.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PredictedLineupPitch({ home, away }: PredictedLineupPitchProps) {
  const hasInjuries = home.injuries.length > 0 || away.injuries.length > 0;

  return (
    <div className={`space-y-4 rounded-xl border border-slate-200 bg-white p-3 sm:p-4 ${CONTENT_WIDTH_CLASS}`}>
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span>{home.teamLabel}</span>
        <span>{away.teamLabel}</span>
      </div>

      <div className="hidden md:block">
        <Pitch home={home} away={away} axis="horizontal" />
      </div>
      <div className="md:hidden">
        <Pitch home={home} away={away} axis="vertical" />
      </div>

      {hasInjuries ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <InjuriesList team={home} />
          <InjuriesList team={away} />
        </div>
      ) : null}
    </div>
  );
}
