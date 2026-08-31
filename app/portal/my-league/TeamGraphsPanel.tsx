"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type PooledShot = {
  fantraxId: string;
  playerName: string;
  fixtureId: string;
  opponentAbbrev: string;
  isHome: boolean;
  minute: number;
  type: string;
  situation: string;
  body: string;
  xg: number;
  x: number;
  y: number;
};

type PooledAveragePosition = {
  fantraxId: string;
  playerName: string;
  fixtureId: string;
  opponentAbbrev: string;
  jerseyNumber: number;
  position: string;
  x: number;
  y: number;
};

type TeamGraphsResponse = {
  gameweek: number;
  unmappedPlayerNames: string[];
  shots: PooledShot[];
  averagePositions: PooledAveragePosition[];
};

type TeamGraphsPanelProps = {
  leagueId: string;
  teamId: string;
  teamName: string;
  gameweeks: number[];
  defaultGameweek: number;
};

const SHOT_STYLE: Record<string, { dot: string; label: string }> = {
  goal: { dot: "bg-emerald-500", label: "Goal" },
  save: { dot: "bg-amber-500", label: "On target" },
  miss: { dot: "bg-slate-400", label: "Off target" },
  block: { dot: "bg-slate-300", label: "Blocked" },
};
const FALLBACK_SHOT_STYLE = { dot: "bg-slate-400", label: "Shot" };

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

// Same fix as the fixture page's Shot Map / Analytics pitches: the drawn
// boundary is inset from the card edge, but coordinates come in on a plain
// 0-100 scale.
const PITCH_INSET_PCT = 3;
function toPitchPct(rawPct: number): number {
  return PITCH_INSET_PCT + (rawPct / 100) * (100 - 2 * PITCH_INSET_PCT);
}

function shotSizePx(xg: number): number {
  return Math.min(30, Math.max(10, 10 + xg * 55));
}

function PitchMarkings() {
  return (
    <>
      <div className="absolute inset-[3%] border border-white/40" />
      <div className="absolute left-1/2 top-[3%] h-[94%] w-px -translate-x-1/2 bg-white/40" />
      <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40" />
      <div className="absolute left-[3%] top-[21%] h-[58%] w-[16%] border border-white/40" />
      <div className="absolute right-[3%] top-[21%] h-[58%] w-[16%] border border-white/40" />
      <div className="absolute left-[3%] top-[38%] h-[24%] w-[6%] border border-white/40" />
      <div className="absolute right-[3%] top-[38%] h-[24%] w-[6%] border border-white/40" />
    </>
  );
}

// Every pooled player attacks the same way, so the "own half" of a full
// pitch would always sit empty -- this shows only the attacking half, goal
// on the right, with the center circle clipped by the container so just its
// arc at the halfway edge shows (matching how broadcast half-pitch graphics
// usually crop it).
function HalfPitchMarkings() {
  return (
    <>
      <div className="absolute inset-[3%] border border-white/40" />
      <div className="absolute left-[3%] top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40" />
      <div className="absolute right-[3%] top-[21%] h-[58%] w-[32%] border border-white/40" />
      <div className="absolute right-[3%] top-[38%] h-[24%] w-[12%] border border-white/40" />
    </>
  );
}

function PlayerLink({ fantraxId, name }: { fantraxId: string; name: string }) {
  return (
    <Link href={`/portal/players/${fantraxId}`} className="font-semibold hover:underline">
      {name}
    </Link>
  );
}

function TeamShotMap({ shots }: { shots: PooledShot[] }) {
  if (shots.length === 0) {
    return <p className="text-sm text-slate-500">No shots recorded for this roster this gameweek.</p>;
  }

  const sortedShots = [...shots].sort((a, b) => a.minute - b.minute);

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 lg:flex-[3]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
          {Object.entries(SHOT_STYLE).map(([type, style]) => (
            <span key={type} className="inline-flex items-center gap-1.5">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${style.dot}`} />
              {style.label}
            </span>
          ))}
          <span className="text-slate-400">Size = xG</span>
        </div>

        <div className="relative mx-auto mt-3 aspect-[4/3] w-full overflow-hidden rounded-lg border border-emerald-900 bg-gradient-to-b from-emerald-700 to-emerald-800">
          <HalfPitchMarkings />
          {sortedShots.map((shot, index) => {
            const style = SHOT_STYLE[shot.type] ?? FALLBACK_SHOT_STYLE;
            const size = shotSizePx(shot.xg);
            return (
              <a
                key={index}
                href={`#team-shot-${index}`}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 transition-transform hover:scale-125 ${style.dot}`}
                style={{ left: `${toPitchPct(shot.x)}%`, top: `${toPitchPct(shot.y)}%`, width: size, height: size }}
                title={`${shot.playerName}, ${shot.minute}' vs ${shot.opponentAbbrev} -- ${style.label} (${shot.xg.toFixed(2)} xG)`}
              />
            );
          })}
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white lg:flex-[2] lg:min-h-0 lg:max-h-none">
        <ul className="divide-y divide-slate-100">
          {sortedShots.map((shot, index) => {
            const style = SHOT_STYLE[shot.type] ?? FALLBACK_SHOT_STYLE;
            const bodyLabel = BODY_LABEL[shot.body] ?? shot.body;
            const situationLabel = SITUATION_LABEL[shot.situation] ?? shot.situation;

            return (
              <li key={index} id={`team-shot-${index}`} className="scroll-mt-4 flex items-center gap-3 px-3 py-2.5 text-sm target:bg-emerald-50 target:ring-1 target:ring-inset target:ring-emerald-400">
                <span className="w-8 shrink-0 text-xs font-semibold text-slate-500">{shot.minute}&apos;</span>
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <PlayerLink fantraxId={shot.fantraxId} name={shot.playerName} />
                    <span className="text-xs font-semibold uppercase text-slate-400">vs {shot.opponentAbbrev}</span>
                  </div>
                  <p className="truncate text-xs text-slate-500">
                    {bodyLabel} &middot; {situationLabel}
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

function TeamAveragePositions({ positions }: { positions: PooledAveragePosition[] }) {
  if (positions.length === 0) {
    return <p className="text-sm text-slate-500">No average-position data yet for this gameweek.</p>;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <p className="text-xs text-slate-500">Each player&apos;s average touch position in their own match that gameweek, normalized onto one pitch.</p>
      <div className="relative mx-auto mt-3 aspect-[16/10] w-full max-w-3xl overflow-hidden rounded-lg border border-emerald-900 bg-gradient-to-b from-emerald-700 to-emerald-800">
        <PitchMarkings />
        {positions.map((player, index) => (
          <div
            key={index}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
            style={{ left: `${toPitchPct(player.x)}%`, top: `${toPitchPct(player.y)}%` }}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-green text-[10px] font-bold text-white shadow">
              {player.jerseyNumber}
            </span>
            <span className="max-w-16 truncate text-[9px] leading-tight text-white drop-shadow">
              <Link href={`/portal/players/${player.fantraxId}`} className="hover:underline">
                {player.playerName}
              </Link>
            </span>
            <span className="text-[8px] leading-tight text-white/80 drop-shadow">vs {player.opponentAbbrev}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TeamGraphsPanel({ leagueId, teamId, teamName, gameweeks, defaultGameweek }: TeamGraphsPanelProps) {
  const [gameweek, setGameweek] = useState(defaultGameweek);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TeamGraphsResponse | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/portal/team-graphs?leagueId=${encodeURIComponent(leagueId)}&teamId=${encodeURIComponent(teamId)}&gameweek=${gameweek}`);
        const body = (await res.json().catch(() => ({}))) as TeamGraphsResponse & { message?: string };
        if (!res.ok) throw new Error(body.message ?? `Failed to load (${res.status})`);
        if (alive) setData(body);
      } catch (err: unknown) {
        if (alive) setError(err instanceof Error ? err.message : "Failed to load team graphs");
      } finally {
        if (alive) setLoading(false);
      }
    }

    void load();

    return () => {
      alive = false;
    };
  }, [leagueId, teamId, gameweek]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-brand-dark">{teamName} -- Team Graphs</h2>
          <p className="text-xs text-slate-500">Shots and average positions pooled from this roster&apos;s real matches, beta.</p>
        </div>
        <label className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Gameweek</span>
          <select
            value={gameweek}
            onChange={(event) => setGameweek(Number.parseInt(event.target.value, 10))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-brand-dark focus:border-brand-green focus:outline-none"
          >
            {gameweeks.map((gw) => (
              <option key={gw} value={gw}>
                GW {gw}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading...</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {!loading && !error && data ? (
        <>
          {data.unmappedPlayerNames.length > 0 ? (
            <p className="text-xs text-slate-400">
              Not yet linked to a match data source: {data.unmappedPlayerNames.join(", ")}.
            </p>
          ) : null}

          {data.shots.length === 0 && data.averagePositions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
              No shot or position data yet for GW {gameweek} -- check back once those matches are underway.
            </div>
          ) : (
            <div className="space-y-6">
              <TeamShotMap shots={data.shots} />
              <TeamAveragePositions positions={data.averagePositions} />
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
