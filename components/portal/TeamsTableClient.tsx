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
            <th className="px-4 py-2 text-center font-bold text-brand-cream" colSpan={5}>
              Points Conceded
            </th>
          </tr>
          <tr>
            <th className="px-4 py-3">
              <button type="button" onClick={() => handleSort("scoredTotal")} className={headerButtonClass}>
                Total
              </button>
            </th>
            <th className="px-4 py-3">
              <button type="button" onClick={() => handleSort("scoredFwd")} className={headerButtonClass}>
                FWD
              </button>
            </th>
            <th className="px-4 py-3">
              <button type="button" onClick={() => handleSort("scoredMid")} className={headerButtonClass}>
                MID
              </button>
            </th>
            <th className="px-4 py-3">
              <button type="button" onClick={() => handleSort("scoredDef")} className={headerButtonClass}>
                DEF
              </button>
            </th>
            <th className="px-4 py-3">
              <button type="button" onClick={() => handleSort("scoredGk")} className={headerButtonClass}>
                GK
              </button>
            </th>
            <th className="px-4 py-3">
              <button type="button" onClick={() => handleSort("concededTotal")} className={headerButtonClass}>
                Total
              </button>
            </th>
            <th className="px-4 py-3">
              <button type="button" onClick={() => handleSort("concededFwd")} className={headerButtonClass}>
                FWD
              </button>
            </th>
            <th className="px-4 py-3">
              <button type="button" onClick={() => handleSort("concededMid")} className={headerButtonClass}>
                MID
              </button>
            </th>
            <th className="px-4 py-3">
              <button type="button" onClick={() => handleSort("concededDef")} className={headerButtonClass}>
                DEF
              </button>
            </th>
            <th className="px-4 py-3">
              <button type="button" onClick={() => handleSort("concededGk")} className={headerButtonClass}>
                GK
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, index) => (
            <tr key={row.abbrev} className={index % 2 === 0 ? "bg-brand-dark/75 text-brand-cream" : "bg-brand-dark text-brand-cream"}>
              <td className="px-4 py-3 font-semibold">
                <Link href={`/portal/teams/${encodeURIComponent(row.abbrev.toLowerCase())}`} className="hover:text-brand-greenLight">
                  {row.teamName}
                </Link>
              </td>
              <td className="px-4 py-3">{row.scoredTotal.toFixed(2)}</td>
              <td className="px-4 py-3">{row.scoredFwd.toFixed(2)}</td>
              <td className="px-4 py-3">{row.scoredMid.toFixed(2)}</td>
              <td className="px-4 py-3">{row.scoredDef.toFixed(2)}</td>
              <td className="px-4 py-3">{row.scoredGk.toFixed(2)}</td>
              <td className="px-4 py-3">{row.concededTotal.toFixed(2)}</td>
              <td className="px-4 py-3">{row.concededFwd.toFixed(2)}</td>
              <td className="px-4 py-3">{row.concededMid.toFixed(2)}</td>
              <td className="px-4 py-3">{row.concededDef.toFixed(2)}</td>
              <td className="px-4 py-3">{row.concededGk.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
