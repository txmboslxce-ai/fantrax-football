"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type UpNextFixture = {
  opponent: string;
  isHome: boolean;
  gameweek: number;
};

type TeamRow = {
  abbrev: string;
  teamName: string;
  rank: number;
  upNext: UpNextFixture | null;
  scoredTotal: number;
  scoredFwd: number;
  scoredMid: number;
  scoredDef: number;
  scoredGk: number;
  concededTotal: number;
  concededFwd: number;
  concededMid: number;
  concededDef: number;
  concededGk: number;
};

type NumericSortKey =
  | "rank"
  | "scoredTotal"
  | "scoredFwd"
  | "scoredMid"
  | "scoredDef"
  | "scoredGk"
  | "concededTotal"
  | "concededFwd"
  | "concededMid"
  | "concededDef"
  | "concededGk";
type SortKey = "teamName" | "upNext" | NumericSortKey;

const metricColumns: Array<{ key: Exclude<NumericSortKey, "rank">; label: string }> = [
  { key: "scoredTotal", label: "Season Pts" },
  { key: "scoredFwd", label: "FWD Pts/Start" },
  { key: "scoredMid", label: "MID Pts/Start" },
  { key: "scoredDef", label: "DEF Pts/Start" },
  { key: "scoredGk", label: "GK Pts/Start" },
  { key: "concededTotal", label: "Season Conceded" },
  { key: "concededFwd", label: "FWD Pts/Start" },
  { key: "concededMid", label: "MID Pts/Start" },
  { key: "concededDef", label: "DEF Pts/Start" },
  { key: "concededGk", label: "GK Pts/Start" },
];

function upNextSortValue(upNext: UpNextFixture | null): number {
  return upNext?.gameweek ?? Number.MAX_SAFE_INTEGER;
}

export default function TeamsTableClient({ rows }: { rows: TeamRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (sortKey === "teamName") {
        const comparison = a.teamName.localeCompare(b.teamName);
        return sortDir === "asc" ? comparison : -comparison;
      }

      if (sortKey === "upNext") {
        const comparison = upNextSortValue(a.upNext) - upNextSortValue(b.upNext);
        return sortDir === "asc" ? comparison : -comparison;
      }

      return sortDir === "asc" ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey];
    });
  }, [rows, sortDir, sortKey]);

  function handleSort(nextKey: Exclude<SortKey, "rank">) {
    if (sortKey === nextKey) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDir(nextKey === "teamName" ? "asc" : "desc");
  }

  const sortArrow = (key: Exclude<SortKey, "rank">) => (sortKey === key ? (sortDir === "asc" ? "↑" : "↓") : "↕");
  const headerButtonClass = "inline-flex w-full items-center gap-1 font-bold";

  return (
    <div className="relative max-h-[75vh] overflow-x-auto overflow-y-auto rounded-lg border border-slate-200 bg-white [scrollbar-gutter:stable]">
      <table className="w-max border-separate border-spacing-0 text-left text-xs">
        <thead>
          <tr className="h-8">
            <th aria-hidden="true" className="sticky left-0 top-0 z-40 h-8 w-9 min-w-9 border-b border-r border-brand-cream/25 bg-brand-green/70" />
            <th aria-hidden="true" className="sticky left-9 top-0 z-40 h-8 w-64 min-w-64 border-b border-r border-brand-cream/25 bg-brand-green/70" />
            <th aria-hidden="true" className="sticky top-0 z-30 h-8 w-32 min-w-32 border-b border-r border-brand-cream/25 bg-brand-green/70" />
            <th colSpan={5} className="sticky top-0 z-30 h-8 border-b border-r border-brand-cream/25 bg-brand-green/70 px-2 text-center text-[10px] font-bold uppercase tracking-wide text-brand-cream">
              Points Scored
            </th>
            <th colSpan={5} className="sticky top-0 z-30 h-8 border-b border-r border-brand-cream/25 bg-brand-green/70 px-2 text-center text-[10px] font-bold uppercase tracking-wide text-brand-cream">
              Points Conceded
            </th>
          </tr>
          <tr>
            <th className="sticky left-0 top-8 z-30 w-9 min-w-9 border-b border-r border-brand-cream/25 bg-brand-green px-1 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-brand-cream">
              #
            </th>
            <th className="sticky left-9 top-8 z-30 w-64 min-w-64 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-brand-cream">
              <button type="button" onClick={() => handleSort("teamName")} className={headerButtonClass}>
                <span>Team</span>
                <span aria-hidden="true">{sortArrow("teamName")}</span>
              </button>
            </th>
            <th className="sticky top-8 z-20 w-32 min-w-32 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-brand-cream">
              <button type="button" onClick={() => handleSort("upNext")} className={headerButtonClass}>
                <span>Up Next</span>
                <span aria-hidden="true">{sortArrow("upNext")}</span>
              </button>
            </th>
            {metricColumns.map((column) => (
              <th key={column.key} className="sticky top-8 z-20 w-[88px] min-w-[88px] border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                <button type="button" onClick={() => handleSort(column.key)} className={`${headerButtonClass} justify-end`}>
                  <span>{column.label}</span>
                  <span aria-hidden="true">{sortArrow(column.key)}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, index) => {
            const rowShade = index % 2 === 0 ? "bg-white" : "bg-slate-50";

            return (
              <tr key={row.abbrev} className={`group ${rowShade} text-brand-dark transition-colors hover:bg-brand-green/10`}>
                <td className={`sticky left-0 z-20 w-9 min-w-9 border-b border-r border-slate-200 px-1 py-1.5 text-center font-semibold tabular-nums text-slate-500 ${rowShade} group-hover:bg-brand-green/10`}>
                  {index + 1}
                </td>
                <td className={`sticky left-9 z-20 w-64 min-w-64 whitespace-nowrap border-b border-r border-slate-200 px-2 py-1.5 font-semibold text-brand-dark ${rowShade} group-hover:bg-brand-green/10`}>
                  <Link href={`/portal/teams/${row.abbrev.toLowerCase()}`} prefetch={false} className="whitespace-nowrap hover:text-brand-green hover:underline">
                    {row.teamName}
                  </Link>
                </td>
                <td className="w-32 min-w-32 border-b border-r border-slate-200 px-2 py-1.5 font-medium text-slate-600">
                  {row.upNext ? `vs ${row.upNext.opponent} (${row.upNext.isHome ? "H" : "A"})` : "—"}
                </td>
                {metricColumns.map((column) => (
                  <td key={column.key} className="w-[88px] min-w-[88px] border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums text-brand-dark">
                    {row[column.key].toFixed(2)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
