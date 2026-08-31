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

// The shot map crops in on just the attacking zone (canonical x from here to
// 100, "at the goal") rather than the full attacking half -- shots from
// further out than this are rare enough that showing the mostly-empty rest
// of the half wasn't worth the space. Anything deeper still renders, just
// clamped to the near edge instead of pushed off it.
const ATTACK_ZOOM_START = 55;
function zoomDepth(canonicalX: number): number {
  return Math.max(0, Math.min(100, ((canonicalX - ATTACK_ZOOM_START) / (100 - ATTACK_ZOOM_START)) * 100));
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

// Every pooled player attacks the same way, so the rest of the pitch would
// always sit empty -- this crops in on just the attacking zone, goal at the
// top (portrait, matching how most single-team shot maps are drawn) rather
// than off to one side. No halfway-line device: ATTACK_ZOOM_START crops
// well inside the attacking half, so the real halfway line isn't in frame.
function HalfPitchMarkings() {
  return (
    <>
      <div className="absolute inset-[3%] border border-white/40" />
      <div className="absolute left-[21%] top-[3%] h-[34%] w-[58%] border border-white/40" />
      <div className="absolute left-[38%] top-[3%] h-[12%] w-[24%] border border-white/40" />
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
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <h3 className="text-sm font-bold text-brand-dark">Shot Map</h3>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
        {Object.entries(SHOT_STYLE).map(([type, style]) => (
          <span key={type} className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${style.dot}`} />
            {style.label}
          </span>
        ))}
        <span className="text-slate-400">Size = xG</span>
      </div>

      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-stretch">
        <div className="mx-auto w-full max-w-sm lg:mx-0 lg:max-w-none lg:flex-[3]">
          <div className="relative aspect-[6/5] w-full overflow-hidden rounded-lg border border-emerald-900 bg-gradient-to-b from-emerald-700 to-emerald-800">
            <HalfPitchMarkings />
            {sortedShots.map((shot, index) => {
              const style = SHOT_STYLE[shot.type] ?? FALLBACK_SHOT_STYLE;
              const size = shotSizePx(shot.xg);
              const top = toPitchPct(100 - zoomDepth(shot.x));
              const left = toPitchPct(shot.y);
              return (
                <a
                  key={index}
                  href={`#team-shot-${index}`}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 transition-transform hover:scale-125 ${style.dot}`}
                  style={{ left: `${left}%`, top: `${top}%`, width: size, height: size }}
                  title={`${shot.playerName}, ${shot.minute}' vs ${shot.opponentAbbrev} -- ${style.label} (${shot.xg.toFixed(2)} xG)`}
                />
              );
            })}
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200 lg:flex-[2] lg:min-h-0 lg:max-h-none">
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
    </div>
  );
}

function TeamAveragePositions({ positions }: { positions: PooledAveragePosition[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (positions.length === 0) {
    return <p className="text-sm text-slate-500">No average-position data yet for this gameweek.</p>;
  }

  function toggle(fantraxId: string) {
    setSelectedId((prev) => (prev === fantraxId ? null : fantraxId));
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <h3 className="text-sm font-bold text-brand-dark">Average Positions</h3>
      <p className="mt-1 text-xs text-slate-500">
        Each player&apos;s average touch position in their own match that gameweek, normalized onto one pitch. Click a player to highlight them.
      </p>

      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-stretch">
        <div className="mx-auto w-full max-w-2xl lg:mx-0 lg:max-w-none lg:flex-[3]">
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg border border-emerald-900 bg-gradient-to-b from-emerald-700 to-emerald-800">
            <PitchMarkings />
            {positions.map((player) => {
              const isSelected = selectedId === player.fantraxId;
              const isDimmed = selectedId !== null && !isSelected;
              return (
                <button
                  key={player.fantraxId}
                  type="button"
                  onClick={() => toggle(player.fantraxId)}
                  className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 transition-all ${isDimmed ? "opacity-30" : ""} ${isSelected ? "z-10 scale-125" : ""}`}
                  style={{ left: `${toPitchPct(player.x)}%`, top: `${toPitchPct(player.y)}%` }}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white shadow ${
                      isSelected ? "bg-amber-500 ring-2 ring-white" : "bg-brand-green"
                    }`}
                  >
                    {player.jerseyNumber}
                  </span>
                  <span className="max-w-16 truncate text-[9px] leading-tight text-white drop-shadow">{player.playerName}</span>
                  <span className="text-[8px] leading-tight text-white/80 drop-shadow">vs {player.opponentAbbrev}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200 lg:flex-[2] lg:min-h-0 lg:max-h-none">
          <ul className="divide-y divide-slate-100">
            {positions.map((player) => {
              const isSelected = selectedId === player.fantraxId;
              return (
                <li key={player.fantraxId}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggle(player.fantraxId)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") toggle(player.fantraxId);
                    }}
                    className={`flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition-colors ${isSelected ? "bg-amber-50" : "hover:bg-slate-50"}`}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-green text-[10px] font-bold text-white">{player.jerseyNumber}</span>
                    <div className="min-w-0 flex-1">
                      <PlayerLink fantraxId={player.fantraxId} name={player.playerName} />
                      <p className="truncate text-xs text-slate-500">
                        {player.position} &middot; vs {player.opponentAbbrev}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
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
