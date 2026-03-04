"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type TeamRow = {
  abbrev: string;
  teamName: string;
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

type SortKey =
  | "teamName"
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

export default function TeamsTableClient({ rows }: { rows: TeamRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("scoredTotal");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const aValue = a[sortKey];
      const bValue = b[sortKey];

      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortDir === "asc" ? aValue - bValue : bValue - aValue;
      }

      const comparison = String(aValue).localeCompare(String(bValue));
      return sortDir === "asc" ? comparison : -comparison;
    });
  }, [rows, sortDir, sortKey]);

  const positionalRanges = useMemo(() => {
    const rangeFor = (values: number[]) => ({
      min: values.length > 0 ? Math.min(...values) : 0,
      max: values.length > 0 ? Math.max(...values) : 0,
    });

    return {
      scoredFwd: rangeFor(rows.map((row) => row.scoredFwd)),
      scoredMid: rangeFor(rows.map((row) => row.scoredMid)),
      scoredDef: rangeFor(rows.map((row) => row.scoredDef)),
      scoredGk: rangeFor(rows.map((row) => row.scoredGk)),
      concededFwd: rangeFor(rows.map((row) => row.concededFwd)),
      concededMid: rangeFor(rows.map((row) => row.concededMid)),
      concededDef: rangeFor(rows.map((row) => row.concededDef)),
      concededGk: rangeFor(rows.map((row) => row.concededGk)),
    };
  }, [rows]);

  function mixColor(a: [number, number, number], b: [number, number, number], ratio: number): string {
    const safeRatio = Math.max(0, Math.min(1, ratio));
    const r = Math.round(a[0] + (b[0] - a[0]) * safeRatio);
    const g = Math.round(a[1] + (b[1] - a[1]) * safeRatio);
    const blue = Math.round(a[2] + (b[2] - a[2]) * safeRatio);
    return `rgb(${r}, ${g}, ${blue})`;
  }

  function gradientBackground(value: number, min: number, max: number): string {
    const red: [number, number, number] = [239, 68, 68];
    const yellow: [number, number, number] = [234, 179, 8];
    const green: [number, number, number] = [42, 122, 59];

    const ratio = max > min ? (value - min) / (max - min) : 0.5;
    if (ratio <= 0.5) {
      return mixColor(red, yellow, ratio * 2);
    }
    return mixColor(yellow, green, (ratio - 0.5) * 2);
  }

  function handleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDir(nextKey === "teamName" ? "asc" : "desc");
  }

  const headerButtonClass = "font-semibold hover:text-brand-cream";

  return (
    <div className="overflow-x-auto rounded-xl border border-brand-cream/20">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-brand-dark text-brand-creamDark">
          <tr>
            <th className="px-4 py-2" rowSpan={2}>
              <button type="button" onClick={() => handleSort("teamName")} className={headerButtonClass}>
                Team
              </button>
            </th>
            <th className="px-4 py-2 text-center font-bold text-brand-cream" colSpan={5}>
              Points Scored
            </th>
            <th className="border-l-2 border-brand-cream/30 px-4 py-2 text-center font-bold text-brand-cream" colSpan={5}>
              Points Conceded
            </th>
          </tr>
          <tr>
            <th className="px-4 py-3 text-xs text-brand-creamDark">
              <button type="button" onClick={() => handleSort("scoredTotal")} className={headerButtonClass}>
                Total
              </button>
            </th>
            <th className="px-4 py-3 text-xs text-brand-creamDark">
              <button type="button" onClick={() => handleSort("scoredFwd")} className={headerButtonClass}>
                FWD
              </button>
            </th>
            <th className="px-4 py-3 text-xs text-brand-creamDark">
              <button type="button" onClick={() => handleSort("scoredMid")} className={headerButtonClass}>
                MID
              </button>
            </th>
            <th className="px-4 py-3 text-xs text-brand-creamDark">
              <button type="button" onClick={() => handleSort("scoredDef")} className={headerButtonClass}>
                DEF
              </button>
            </th>
            <th className="px-4 py-3 text-xs text-brand-creamDark">
              <button type="button" onClick={() => handleSort("scoredGk")} className={headerButtonClass}>
                GK
              </button>
            </th>
            <th className="border-l-2 border-brand-cream/30 px-4 py-3 text-xs text-brand-creamDark">
              <button type="button" onClick={() => handleSort("concededTotal")} className={headerButtonClass}>
                Total
              </button>
            </th>
            <th className="px-4 py-3 text-xs text-brand-creamDark">
              <button type="button" onClick={() => handleSort("concededFwd")} className={headerButtonClass}>
                FWD
              </button>
            </th>
            <th className="px-4 py-3 text-xs text-brand-creamDark">
              <button type="button" onClick={() => handleSort("concededMid")} className={headerButtonClass}>
                MID
              </button>
            </th>
            <th className="px-4 py-3 text-xs text-brand-creamDark">
              <button type="button" onClick={() => handleSort("concededDef")} className={headerButtonClass}>
                DEF
              </button>
            </th>
            <th className="px-4 py-3 text-xs text-brand-creamDark">
              <button type="button" onClick={() => handleSort("concededGk")} className={headerButtonClass}>
                GK
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, index) => (
            <tr key={row.abbrev} className={index % 2 === 0 ? "bg-brand-dark/80 text-brand-cream" : "bg-brand-dark/60 text-brand-cream"}>
              <td className="px-4 py-3 font-semibold">
                <Link href={`/portal/teams/${encodeURIComponent(row.abbrev.toLowerCase())}`} className="font-bold hover:text-brand-greenLight">
                  {row.teamName}
                </Link>
              </td>
              <td className="px-4 py-3">{row.scoredTotal.toFixed(2)}</td>
              <td className="px-4 py-3">
                <span
                  className="inline-block min-w-14 rounded px-2 py-1 text-center font-semibold text-[#0f1f13]"
                  style={{
                    backgroundColor: gradientBackground(row.scoredFwd, positionalRanges.scoredFwd.min, positionalRanges.scoredFwd.max),
                  }}
                >
                  {row.scoredFwd.toFixed(2)}
                </span>
              </td>
              <td className="px-4 py-3">
                <span
                  className="inline-block min-w-14 rounded px-2 py-1 text-center font-semibold text-[#0f1f13]"
                  style={{
                    backgroundColor: gradientBackground(row.scoredMid, positionalRanges.scoredMid.min, positionalRanges.scoredMid.max),
                  }}
                >
                  {row.scoredMid.toFixed(2)}
                </span>
              </td>
              <td className="px-4 py-3">
                <span
                  className="inline-block min-w-14 rounded px-2 py-1 text-center font-semibold text-[#0f1f13]"
                  style={{
                    backgroundColor: gradientBackground(row.scoredDef, positionalRanges.scoredDef.min, positionalRanges.scoredDef.max),
                  }}
                >
                  {row.scoredDef.toFixed(2)}
                </span>
              </td>
              <td className="px-4 py-3">
                <span
                  className="inline-block min-w-14 rounded px-2 py-1 text-center font-semibold text-[#0f1f13]"
                  style={{
                    backgroundColor: gradientBackground(row.scoredGk, positionalRanges.scoredGk.min, positionalRanges.scoredGk.max),
                  }}
                >
                  {row.scoredGk.toFixed(2)}
                </span>
              </td>
              <td className="border-l-2 border-brand-cream/20 px-4 py-3">{row.concededTotal.toFixed(2)}</td>
              <td className="px-4 py-3">
                <span
                  className="inline-block min-w-14 rounded px-2 py-1 text-center font-semibold text-[#0f1f13]"
                  style={{
                    backgroundColor: gradientBackground(
                      row.concededFwd,
                      positionalRanges.concededFwd.min,
                      positionalRanges.concededFwd.max
                    ),
                  }}
                >
                  {row.concededFwd.toFixed(2)}
                </span>
              </td>
              <td className="px-4 py-3">
                <span
                  className="inline-block min-w-14 rounded px-2 py-1 text-center font-semibold text-[#0f1f13]"
                  style={{
                    backgroundColor: gradientBackground(
                      row.concededMid,
                      positionalRanges.concededMid.min,
                      positionalRanges.concededMid.max
                    ),
                  }}
                >
                  {row.concededMid.toFixed(2)}
                </span>
              </td>
              <td className="px-4 py-3">
                <span
                  className="inline-block min-w-14 rounded px-2 py-1 text-center font-semibold text-[#0f1f13]"
                  style={{
                    backgroundColor: gradientBackground(
                      row.concededDef,
                      positionalRanges.concededDef.min,
                      positionalRanges.concededDef.max
                    ),
                  }}
                >
                  {row.concededDef.toFixed(2)}
                </span>
              </td>
              <td className="px-4 py-3">
                <span
                  className="inline-block min-w-14 rounded px-2 py-1 text-center font-semibold text-[#0f1f13]"
                  style={{
                    backgroundColor: gradientBackground(
                      row.concededGk,
                      positionalRanges.concededGk.min,
                      positionalRanges.concededGk.max
                    ),
                  }}
                >
                  {row.concededGk.toFixed(2)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
