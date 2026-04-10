"use client";

import AvailabilityIcon from "@/app/components/ui/AvailabilityIcon";
import { useMemo, useState } from "react";
import type { LineupPlayer, TeamLineup } from "./page";

type Props = {
  lineups: TeamLineup[];
};

function posBadgeClass(pos: LineupPlayer["position"]): string {
  switch (pos) {
    case "G": return "bg-yellow-700/50 text-yellow-200";
    case "D": return "bg-blue-800/50 text-blue-200";
    case "M": return "bg-green-800/50 text-green-200";
    case "F": return "bg-red-800/50 text-red-200";
  }
}

function formatSp(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function mixColor(a: [number, number, number], b: [number, number, number], ratio: number): string {
  const t = clamp(ratio, 0, 1);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

function spColor(v: number): string {
  const red: [number, number, number] = [239, 68, 68];
  const yellow: [number, number, number] = [234, 179, 8];
  const green: [number, number, number] = [42, 122, 59];
  const ratio = clamp(v, 0, 1);
  if (ratio <= 0.5) return mixColor(red, yellow, ratio * 2);
  return mixColor(yellow, green, (ratio - 0.5) * 2);
}

function TeamCard({ lineup }: { lineup: TeamLineup }) {
  const starters = lineup.players.filter((p) => p.isStarter);
  const subs = lineup.players.filter((p) => !p.isStarter);

  function PlayerRow({ player, index }: { player: LineupPlayer; index: number }) {
    const shade = index % 2 === 0 ? "bg-brand-dark/60" : "bg-brand-dark/90";
    return (
      <tr className={`${shade} text-brand-cream`}>
        <td className={`border-b border-r border-brand-cream/10 px-2 py-1.5 ${shade}`}>
          <div className="flex flex-wrap items-center gap-1 text-sm font-semibold leading-tight">
            <span>{player.playerName}</span>
            <AvailabilityIcon
              chanceOfPlaying={player.chanceOfPlaying}
              status={player.availabilityStatus}
              news={player.availabilityNews}
            />
          </div>
          <div className="mt-0.5 text-xs text-brand-creamDark/70">
            {player.gamesStarted} starts
          </div>
        </td>
        <td className={`border-b border-r border-brand-cream/10 px-2 py-1.5 text-center ${shade}`}>
          <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold ${posBadgeClass(player.position)}`}>
            {player.position}
          </span>
        </td>
        <td className={`border-b border-r border-brand-cream/10 px-2 py-1.5 text-center text-sm ${shade}`}>
          {player.prevGwMinutes !== null ? (
            <span className="font-semibold">{player.prevGwMinutes}</span>
          ) : (
            <span className="text-brand-creamDark/50">DNP</span>
          )}
        </td>
        <td className={`border-b border-r border-brand-cream/10 px-2 py-1.5 text-center text-sm font-semibold ${shade}`}>
          {player.ptsPerStart > 0 ? player.ptsPerStart.toFixed(2) : <span className="text-brand-creamDark/50">—</span>}
        </td>
        <td className={`border-b border-brand-cream/10 px-2 py-1.5 text-center ${shade}`}>
          <span
            className="inline-flex rounded-md px-2 py-0.5 text-xs font-bold text-white"
            style={{ backgroundColor: spColor(player.startProbability) }}
          >
            {formatSp(player.startProbability)}
          </span>
        </td>
      </tr>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-brand-cream/20">
      {/* Team header */}
      <div className="flex items-center justify-between border-b border-brand-cream/20 bg-[#1A4D2E] px-4 py-2.5">
        <span className="text-sm font-black uppercase tracking-wide text-brand-cream">{lineup.team}</span>
        <span className="text-xs font-semibold text-brand-creamDark">GW{lineup.gameweek}</span>
      </div>

      <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-r border-brand-cream/25 bg-[#1a3a22] px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-brand-creamDark">
              Player
            </th>
            <th className="border-b border-r border-brand-cream/25 bg-[#1a3a22] px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-brand-creamDark">
              Pos
            </th>
            <th className="border-b border-r border-brand-cream/25 bg-[#1a3a22] px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-brand-creamDark">
              Prev Mins
            </th>
            <th className="border-b border-r border-brand-cream/25 bg-[#1a3a22] px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-brand-creamDark">
              Pts/Start
            </th>
            <th className="border-b border-brand-cream/25 bg-[#1a3a22] px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-brand-creamDark">
              Start %
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Starting XI */}
          {starters.map((player, i) => (
            <PlayerRow key={player.playerId} player={player} index={i} />
          ))}

          {/* Subs divider */}
          {subs.length > 0 ? (
            <>
              <tr>
                <td
                  colSpan={5}
                  className="border-b border-brand-cream/20 bg-brand-dark/40 px-2 py-1 text-center text-[10px] font-bold uppercase tracking-widest text-brand-creamDark/60"
                >
                  Substitutes
                </td>
              </tr>
              {subs.map((player, i) => (
                <PlayerRow key={player.playerId} player={player} index={starters.length + 1 + i} />
              ))}
            </>
          ) : null}

          {lineup.players.length === 0 ? (
            <tr>
              <td colSpan={5} className="bg-brand-dark/90 px-4 py-4 text-center text-xs text-brand-creamDark">
                No prediction data for this team.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export default function LineupPredictorClient({ lineups }: Props) {
  const [teamFilter, setTeamFilter] = useState("All");

  const teams = useMemo(() => lineups.map((l) => l.team), [lineups]);

  const visible = useMemo(
    () => (teamFilter === "All" ? lineups : lineups.filter((l) => l.team === teamFilter)),
    [lineups, teamFilter],
  );

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="rounded-xl border border-brand-cream/20 bg-brand-dark px-3 py-2.5">
        <div className="flex items-end gap-2 text-xs">
          <label className="space-y-1 shrink-0">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Team</span>
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="rounded border border-brand-cream/35 bg-brand-dark px-2 py-1 text-xs text-brand-cream focus:border-brand-green focus:outline-none md:w-36"
            >
              <option value="All">All teams</option>
              {teams.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <p className="pb-1 text-xs text-brand-creamDark">
            {visible.length === 1
              ? "1 team"
              : `${visible.length} teams`}
            {" · "}
            Start % ≥ 50% = predicted starter
          </p>
        </div>
      </div>

      {/* Team cards */}
      {visible.length === 0 ? (
        <div className="rounded-xl border border-brand-cream/20 bg-brand-dark px-4 py-8 text-center text-sm text-brand-creamDark">
          No lineup predictions available. Predictions must be generated first.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visible.map((lineup) => (
            <TeamCard key={lineup.team} lineup={lineup} />
          ))}
        </div>
      )}
    </div>
  );
}
