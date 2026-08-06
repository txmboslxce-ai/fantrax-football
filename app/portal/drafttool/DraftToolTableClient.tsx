"use client";

import type { PlayerWindowStats } from "@/lib/portal/playerMetrics";
import Link from "next/link";
import { useState } from "react";

type DraftToolPlayer = {
  id: string;
  name: string;
  team: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  setPieces: {
    penaltiesOrder: number | null;
    cornersOrder: number | null;
    directFreekicksOrder: number | null;
  };
  stats: PlayerWindowStats;
  adp: number | null;
  rank: number;
};

function positionLetter(position: DraftToolPlayer["position"]): "G" | "D" | "M" | "F" {
  if (position === "GK") return "G";
  if (position === "DEF") return "D";
  if (position === "MID") return "M";
  return "F";
}

function positionBadgeClass(position: DraftToolPlayer["position"]): string {
  if (position === "GK") return "bg-amber-100 text-amber-900";
  if (position === "DEF") return "bg-emerald-200 text-emerald-950";
  if (position === "MID") return "bg-violet-200 text-violet-950";
  return "bg-orange-200 text-orange-950";
}

function formatNumber(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "0.00";
}

function formatAdpDelta(adp: number | null, rank: number): string {
  if (adp == null) return "—";

  const delta = adp - rank;
  return `${delta > 0 ? "+" : ""}${formatNumber(delta, 1)}`;
}

function setPieceLabel(setPieces: DraftToolPlayer["setPieces"]): string | null {
  const labels = [
    setPieces.penaltiesOrder != null ? `P${setPieces.penaltiesOrder}` : null,
    setPieces.cornersOrder != null ? `C${setPieces.cornersOrder}` : null,
    setPieces.directFreekicksOrder != null ? `FK${setPieces.directFreekicksOrder}` : null,
  ].filter((label): label is string => label != null);

  return labels.length > 0 ? labels.join(" · ") : null;
}

export default function DraftToolTableClient({ players }: { players: DraftToolPlayer[] }) {
  const [pickedPlayerIds, setPickedPlayerIds] = useState<Set<string>>(new Set());

  function togglePicked(playerId: string) {
    setPickedPlayerIds((current) => {
      const next = new Set(current);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  }

  return (
    <div className="max-h-[75vh] overflow-x-auto overflow-y-auto rounded-lg border border-slate-200 bg-white [scrollbar-gutter:stable]">
      <table className="w-max border-separate border-spacing-0 text-left text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-30 w-14 min-w-14 border-b border-r border-brand-cream/25 bg-brand-green px-1 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-brand-cream">
              Picked?
            </th>
            <th className="sticky left-14 top-0 z-30 w-48 min-w-48 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-brand-cream">
              Player
            </th>
            <th className="sticky left-[248px] top-0 z-30 w-10 min-w-10 border-b border-r border-brand-cream/25 bg-brand-green px-1 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-brand-cream">
              Pos
            </th>
            <th className="sticky top-0 z-20 min-w-14 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-brand-cream">Team</th>
            <th className="sticky top-0 z-20 min-w-14 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">ADP</th>
            <th className="sticky top-0 z-20 min-w-12 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">Rank</th>
            <th className="sticky top-0 z-20 min-w-[76px] border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">ADP v Rank</th>
            <th className="sticky top-0 z-20 min-w-[84px] border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">FPts (Season)</th>
            <th className="sticky top-0 z-20 min-w-14 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">FP/G</th>
            <th className="sticky top-0 z-20 min-w-[72px] border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">FP/Start</th>
            <th className="sticky top-0 z-20 min-w-[100px] border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">Ghost Pts/Start</th>
            <th className="sticky top-0 z-20 min-w-10 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">GS</th>
            <th className="sticky top-0 z-20 min-w-[82px] border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">Floor/Start</th>
            <th className="sticky top-0 z-20 min-w-[92px] border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">Ceiling/Start</th>
            <th className="sticky top-0 z-20 min-w-[96px] border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">Floor (10th pct)</th>
            <th className="sticky top-0 z-20 min-w-[108px] border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">Ceiling (90th pct)</th>
            <th className="sticky top-0 z-20 min-w-24 border-b border-brand-cream/25 bg-brand-green px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-brand-cream">Set Pieces</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player, index) => {
            const rowShade = index % 2 === 0 ? "bg-white" : "bg-slate-50";
            const position = positionLetter(player.position);
            const setPieces = setPieceLabel(player.setPieces);
            const fantasyPtsPerGame = player.stats.games_played > 0 ? player.stats.season_pts / player.stats.games_played : 0;

            return (
              <tr key={player.id} className={`group ${rowShade} text-brand-dark transition-colors hover:bg-brand-green/10`}>
                <td className={`sticky left-0 z-20 w-14 min-w-14 border-b border-r border-slate-200 px-1 py-1.5 text-center ${rowShade} group-hover:bg-brand-green/10`}>
                  <input
                    type="checkbox"
                    checked={pickedPlayerIds.has(player.id)}
                    onChange={() => togglePicked(player.id)}
                    aria-label={`Mark ${player.name} as picked`}
                    className="h-4 w-4 accent-brand-green"
                  />
                </td>
                <td className={`sticky left-14 z-20 w-48 min-w-48 border-b border-r border-slate-200 px-2 py-1.5 font-semibold text-brand-dark ${rowShade} group-hover:bg-brand-green/10`}>
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <Link href={`/portal/players/${player.id}`} className="hover:text-brand-green">
                      {player.name}
                    </Link>
                    <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-600">{player.team}</span>
                  </span>
                </td>
                <td className={`sticky left-[248px] z-20 w-10 min-w-10 border-b border-r border-slate-200 px-1 py-1.5 text-center ${rowShade} group-hover:bg-brand-green/10`}>
                  <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${positionBadgeClass(player.position)}`}>
                    {position}
                  </span>
                </td>
                <td className="border-b border-r border-slate-200 px-2 py-1.5 font-medium text-slate-600">{player.team}</td>
                <td className="border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums">{player.adp == null ? "—" : formatNumber(player.adp, 1)}</td>
                <td className="border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums">{player.rank}</td>
                <td className="border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums">{formatAdpDelta(player.adp, player.rank)}</td>
                <td className="border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums">{formatNumber(player.stats.season_pts)}</td>
                <td className="border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums">{formatNumber(fantasyPtsPerGame)}</td>
                <td className="border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums">{formatNumber(player.stats.fantasy_pts_per_start)}</td>
                <td className="border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums">{formatNumber(player.stats.ghost_pts_per_start)}</td>
                <td className="border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums">{player.stats.games_started}</td>
                <td className="border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums">{formatNumber(player.stats.floor_per_start)}</td>
                <td className="border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums">{formatNumber(player.stats.ceiling_per_start)}</td>
                <td className="border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums">{formatNumber(player.stats.tenth_percentile_per_start)}</td>
                <td className="border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums">{formatNumber(player.stats.ninetieth_percentile_per_start)}</td>
                <td className="border-b border-slate-200 px-2 py-1.5">
                  {setPieces ? <span className="inline-flex rounded-full bg-brand-green/10 px-2 py-0.5 text-[10px] font-semibold text-brand-green">{setPieces}</span> : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
