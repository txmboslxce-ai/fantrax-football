"use client";

import { Fragment } from "react";
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
  percentileNote?: string;
};

function formatValue(value: number, digits: number): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "0".padEnd(digits > 0 ? digits + 2 : 1, "0");
}

export default function PercentileStatsTable({ players, rows, percentileNote }: PercentileStatsTableProps) {
  if (players.length === 0 || rows.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[28rem] text-left text-xs">
        <thead>
          <tr className="bg-brand-green text-brand-cream">
            <th rowSpan={2} className="align-bottom px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide">
              Stat
            </th>
            {players.map((player) => (
              <th
                key={player.id}
                colSpan={2}
                className="border-l border-brand-cream/20 px-3 py-1.5 text-center text-[10px] font-bold uppercase tracking-wide"
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: player.color }} />
                  {player.name}
                </span>
              </th>
            ))}
          </tr>
          <tr className="bg-brand-green text-brand-cream">
            {players.map((player) => (
              <Fragment key={player.id}>
                <th className="border-l border-brand-cream/20 px-3 py-1 text-right text-[9px] font-semibold uppercase tracking-wide text-brand-creamDark">
                  Value
                </th>
                <th
                  className="px-3 py-1 text-right text-[9px] font-semibold uppercase tracking-wide text-brand-creamDark"
                  title={percentileNote}
                >
                  Percentile
                </th>
              </Fragment>
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
                    <Fragment key={player.id}>
                      <td className="border-t border-l border-slate-100 px-3 py-1.5 text-right font-semibold tabular-nums">
                        {formatValue(entry?.rawValue ?? 0, row.digits ?? 1)}
                      </td>
                      <td className="border-t border-slate-100 px-3 py-1.5 text-right tabular-nums">
                        <span
                          className="inline-flex min-w-[1.75rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
                          style={{ backgroundColor: percentileColor(entry?.percentile ?? 0) }}
                        >
                          {Math.round(entry?.percentile ?? 0)}
                        </span>
                      </td>
                    </Fragment>
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
