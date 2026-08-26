"use client";

import { percentileColor } from "@/lib/portal/scoreColor";

export type StatTablePlayerValue = {
  playerId: string;
  rawValue: number;
  percentile: number;
};

export type StatTableRow = {
  stat: string;
  digits?: number;
  values: StatTablePlayerValue[];
};

type PercentileStatsTableProps = {
  players: Array<{ id: string; name: string; color: string }>;
  rows: StatTableRow[];
};

function formatValue(value: number, digits: number): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "0".padEnd(digits > 0 ? digits + 2 : 1, "0");
}

export default function PercentileStatsTable({ players, rows }: PercentileStatsTableProps) {
  if (players.length === 0 || rows.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[28rem] text-left text-xs">
        <thead>
          <tr className="bg-brand-green text-brand-cream">
            <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide">Stat</th>
            {players.map((player) => (
              <th key={player.id} className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide">
                <span className="inline-flex items-center justify-end gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: player.color }} />
                  {player.name}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const rowShade = index % 2 === 0 ? "bg-white" : "bg-slate-50";
            return (
              <tr key={row.stat} className={`${rowShade} text-brand-dark`}>
                <td className="border-t border-slate-100 px-3 py-1.5 font-semibold">{row.stat}</td>
                {players.map((player) => {
                  const entry = row.values.find((value) => value.playerId === player.id);
                  return (
                    <td key={player.id} className="border-t border-slate-100 px-3 py-1.5 text-right tabular-nums">
                      <span className="font-semibold">{formatValue(entry?.rawValue ?? 0, row.digits ?? 1)}</span>
                      <span
                        className="ml-2 inline-flex min-w-[1.75rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
                        style={{ backgroundColor: percentileColor(entry?.percentile ?? 0) }}
                        title="Percentile within the guard-railed, same-position pool"
                      >
                        {Math.round(entry?.percentile ?? 0)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
