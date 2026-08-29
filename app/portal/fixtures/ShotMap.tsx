import Link from "next/link";
import type { BsdShot, BsdShotType } from "@/lib/bsd/eventStats";

export type ShotPlayerInfo = {
  name: string;
  fantraxId?: string;
};

type ShotMapProps = {
  shots: BsdShot[];
  homeAbbrev: string;
  awayAbbrev: string;
  playerInfoById: Map<number, ShotPlayerInfo>;
};

const SHOT_STYLE: Record<BsdShotType, { dot: string; label: string }> = {
  goal: { dot: "bg-emerald-500", label: "Goal" },
  save: { dot: "bg-amber-500", label: "On target" },
  miss: { dot: "bg-slate-400", label: "Off target" },
  block: { dot: "bg-slate-300", label: "Blocked" },
};

const BODY_LABEL: Record<string, string> = {
  head: "Header",
  "left-foot": "Left foot",
  "right-foot": "Right foot",
};

const SITUATION_LABEL: Record<string, string> = {
  regular: "Open play",
  assisted: "Assisted",
  "free-kick": "Free kick",
  corner: "Corner",
  penalty: "Penalty",
  "throw-in-set-piece": "Throw-in",
};

// Box depth as a fraction of the "distance from goal" scale these shots use
// (roughly meters), used only to label a shot inside/outside the box.
const BOX_DEPTH = 16.5;

function shotSizePx(xg: number): number {
  return Math.min(30, Math.max(10, 10 + xg * 55));
}

function PlayerLabel({ playerId, playerInfoById }: { playerId: number; playerInfoById: Map<number, ShotPlayerInfo> }) {
  const info = playerInfoById.get(playerId);
  if (!info) {
    return <>Unknown player</>;
  }
  if (info.fantraxId) {
    return (
      <Link href={`/portal/players/${info.fantraxId}`} className="font-semibold hover:underline">
        {info.name}
      </Link>
    );
  }
  return <span className="font-semibold">{info.name}</span>;
}

export default function ShotMap({ shots, homeAbbrev, awayAbbrev, playerInfoById }: ShotMapProps) {
  if (shots.length === 0) {
    return (
      <div className="max-w-[850px] rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
        No shot data yet -- check back once the match is underway.
      </div>
    );
  }

  const sortedShots = [...shots].sort((a, b) => a.minute - b.minute);

  return (
    <div className="max-w-[850px] space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
          {(Object.keys(SHOT_STYLE) as BsdShotType[]).map((type) => (
            <span key={type} className="inline-flex items-center gap-1.5">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${SHOT_STYLE[type].dot}`} />
              {SHOT_STYLE[type].label}
            </span>
          ))}
          <span className="text-slate-400">Size = xG</span>
        </div>

        <div className="relative mx-auto mt-3 aspect-[16/10] w-full max-w-3xl overflow-hidden rounded-lg border border-emerald-900 bg-gradient-to-b from-emerald-700 to-emerald-800">
          <div className="absolute inset-[3%] border border-white/40" />
          <div className="absolute left-1/2 top-[3%] h-[94%] w-px -translate-x-1/2 bg-white/40" />
          <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40" />

          {sortedShots.map((shot, index) => {
            // Home attacks the right edge of this shared pitch, away the
            // left -- shot.x is "distance from the goal being shot at", so
            // only home's needs mirroring to land near the right edge.
            const left = shot.isHome ? 100 - shot.x : shot.x;
            const size = shotSizePx(shot.xg);

            return (
              <div
                key={index}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 ${SHOT_STYLE[shot.type].dot}`}
                style={{ left: `${left}%`, top: `${shot.y}%`, width: size, height: size }}
                title={`${shot.minute}' -- ${SHOT_STYLE[shot.type].label} (${shot.xg.toFixed(2)} xG)`}
              />
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-100">
          {sortedShots.map((shot, index) => {
            const zone = shot.x <= BOX_DEPTH ? "Inside box" : "Outside box";
            const bodyLabel = BODY_LABEL[shot.body] ?? shot.body;
            const situationLabel = SITUATION_LABEL[shot.situation] ?? shot.situation;

            return (
              <li key={index} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <span className="w-8 shrink-0 text-xs font-semibold text-slate-500">{shot.minute}&apos;</span>
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${SHOT_STYLE[shot.type].dot}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <PlayerLabel playerId={shot.playerId} playerInfoById={playerInfoById} />
                    <span className="text-xs font-semibold uppercase text-slate-400">{shot.isHome ? homeAbbrev : awayAbbrev}</span>
                  </div>
                  <p className="truncate text-xs text-slate-500">
                    {bodyLabel} &middot; {situationLabel} &middot; {zone}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold text-brand-dark">{shot.xg.toFixed(2)} xG</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
