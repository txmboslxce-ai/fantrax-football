"use client";

import type { InjuryPlayerRow } from "@/app/portal/injury/page";
import { positionBadgeClass } from "@/lib/portal/positionBadge";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type InjuryTableClientProps = {
  players: InjuryPlayerRow[];
};

type SortKey = "name" | "seasonPts" | "ownershipPct" | "statusLabel" | "chanceThisRound" | "chanceNextRound";

const positionFilters: Array<"All" | "GK" | "DEF" | "MID" | "FWD"> = ["All", "GK", "DEF", "MID", "FWD"];
const statusFilters: InjuryPlayerRow["statusLabel"][] = ["Doubtful", "Injured", "Suspended", "Unavailable"];

function statusBadgeClass(status: InjuryPlayerRow["statusLabel"]): string {
  if (status === "Injured") return "bg-red-100 text-red-900";
  if (status === "Suspended") return "bg-fuchsia-100 text-fuchsia-900";
  if (status === "Unavailable") return "bg-slate-200 text-slate-900";
  return "bg-amber-100 text-amber-900";
}

function formatChance(value: number | null): string {
  return value == null ? "-" : `${value}%`;
}

export default function InjuryTableClient({ players }: InjuryTableClientProps) {
  const router = useRouter();
  const [positionFilter, setPositionFilter] = useState<(typeof positionFilters)[number]>("All");
  const [teamFilter, setTeamFilter] = useState("All");
  const [ownershipMin, setOwnershipMin] = useState("0");
  const [ownershipMax, setOwnershipMax] = useState("100");
  const [chanceMin, setChanceMin] = useState("0");
  const [chanceMax, setChanceMax] = useState("100");
  const [activeStatuses, setActiveStatuses] = useState<Set<InjuryPlayerRow["statusLabel"]>>(new Set(statusFilters));
  const [sortKey, setSortKey] = useState<SortKey>("seasonPts");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const teams = useMemo(() => {
    return [...new Set(players.map((player) => player.team))].sort((a, b) => a.localeCompare(b));
  }, [players]);

  const filteredAndSorted = useMemo(() => {
    const parsedOwnershipMin = Number(ownershipMin);
    const parsedOwnershipMax = Number(ownershipMax);
    const safeOwnershipMin = Number.isFinite(parsedOwnershipMin) ? parsedOwnershipMin : 0;
    const safeOwnershipMax = Number.isFinite(parsedOwnershipMax) ? parsedOwnershipMax : 100;
    const lowerOwnershipBound = Math.max(0, Math.min(safeOwnershipMin, safeOwnershipMax));
    const upperOwnershipBound = Math.min(100, Math.max(safeOwnershipMin, safeOwnershipMax));

    const parsedChanceMin = Number(chanceMin);
    const parsedChanceMax = Number(chanceMax);
    const safeChanceMin = Number.isFinite(parsedChanceMin) ? parsedChanceMin : 0;
    const safeChanceMax = Number.isFinite(parsedChanceMax) ? parsedChanceMax : 100;
    const lowerChanceBound = Math.max(0, Math.min(safeChanceMin, safeChanceMax));
    const upperChanceBound = Math.min(100, Math.max(safeChanceMin, safeChanceMax));

    const filtered = players.filter((player) => {
      const matchesPosition = positionFilter === "All" || player.position === positionFilter;
      const matchesTeam = teamFilter === "All" || player.team === teamFilter;
      const matchesOwnership = player.ownershipPct >= lowerOwnershipBound && player.ownershipPct <= upperOwnershipBound;
      const matchesChance =
        player.chanceNextRound == null || (player.chanceNextRound >= lowerChanceBound && player.chanceNextRound <= upperChanceBound);
      const matchesStatus = activeStatuses.has(player.statusLabel);
      return matchesPosition && matchesTeam && matchesOwnership && matchesChance && matchesStatus;
    });

    return [...filtered].sort((a, b) => {
      if (sortKey === "name") {
        const comparison = a.name.localeCompare(b.name);
        return sortDir === "asc" ? comparison : -comparison;
      }
      if (sortKey === "statusLabel") {
        const comparison = a.statusLabel.localeCompare(b.statusLabel);
        return sortDir === "asc" ? comparison : -comparison;
      }

      const aValue = sortKey === "chanceThisRound" || sortKey === "chanceNextRound" ? a[sortKey] ?? -1 : a[sortKey];
      const bValue = sortKey === "chanceThisRound" || sortKey === "chanceNextRound" ? b[sortKey] ?? -1 : b[sortKey];
      return sortDir === "asc" ? aValue - bValue : bValue - aValue;
    });
  }, [activeStatuses, chanceMax, chanceMin, ownershipMax, ownershipMin, players, positionFilter, sortDir, sortKey, teamFilter]);

  function handleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDir(nextKey === "name" ? "asc" : "desc");
  }

  function toggleStatus(status: InjuryPlayerRow["statusLabel"]) {
    setActiveStatuses((current) => {
      const next = new Set(current);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }

  const sortArrow = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? "↑" : "↓") : "↕");

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <div className="space-y-1">
            <span className="block font-semibold uppercase tracking-wide text-slate-500">Position</span>
            <div className="flex flex-nowrap gap-1">
              {positionFilters.map((filter) => {
                const active = positionFilter === filter;
                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setPositionFilter(filter)}
                    className={`rounded border px-2 py-1 text-[11px] font-semibold ${
                      active ? "border-brand-green bg-brand-green text-brand-cream" : "border-slate-300 bg-white text-brand-dark hover:bg-slate-50"
                    }`}
                  >
                    {filter}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <span className="block font-semibold uppercase tracking-wide text-slate-500">Status</span>
            <div className="flex flex-nowrap gap-1">
              {statusFilters.map((status) => {
                const active = activeStatuses.has(status);
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => toggleStatus(status)}
                    className={`rounded border px-2 py-1 text-[11px] font-semibold ${
                      active ? "border-brand-green bg-brand-green text-brand-cream" : "border-slate-300 bg-white text-brand-dark hover:bg-slate-50"
                    }`}
                  >
                    {status}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="space-y-1">
            <span className="block font-semibold uppercase tracking-wide text-slate-500">Team</span>
            <select
              value={teamFilter}
              onChange={(event) => setTeamFilter(event.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-brand-dark focus:border-brand-green focus:outline-none md:w-24"
            >
              <option value="All">All</option>
              {teams.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-1">
            <span className="block font-semibold uppercase tracking-wide text-slate-500">Ownership %</span>
            <div className="grid grid-cols-2 gap-1 md:flex">
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={ownershipMin}
                onChange={(event) => setOwnershipMin(event.target.value)}
                placeholder="Min"
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-brand-dark md:w-16"
              />
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={ownershipMax}
                onChange={(event) => setOwnershipMax(event.target.value)}
                placeholder="Max"
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-brand-dark md:w-16"
              />
            </div>
          </div>

          <div className="space-y-1">
            <span className="block font-semibold uppercase tracking-wide text-slate-500">Chance of Playing %</span>
            <div className="grid grid-cols-2 gap-1 md:flex">
              <input
                type="number"
                min={0}
                max={100}
                step="1"
                value={chanceMin}
                onChange={(event) => setChanceMin(event.target.value)}
                placeholder="Min"
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-brand-dark md:w-16"
              />
              <input
                type="number"
                min={0}
                max={100}
                step="1"
                value={chanceMax}
                onChange={(event) => setChanceMax(event.target.value)}
                placeholder="Max"
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-brand-dark md:w-16"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="relative max-h-[75vh] overflow-x-auto overflow-y-auto rounded-lg border border-slate-200 bg-white [scrollbar-gutter:stable]">
        <table className="w-max border-separate border-spacing-0 text-left text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 w-10 min-w-10 border-b border-r border-brand-cream/25 bg-brand-green px-1 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                Pos
              </th>
              <th className="sticky left-10 top-0 z-30 w-48 min-w-48 max-w-48 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                <button type="button" onClick={() => handleSort("name")} className="inline-flex items-center gap-1">
                  <span>Player</span>
                  <span aria-hidden="true">{sortArrow("name")}</span>
                </button>
              </th>
              <th className="sticky top-0 z-20 w-14 min-w-14 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                Team
              </th>
              <th className="sticky top-0 z-20 w-16 min-w-16 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                <button type="button" onClick={() => handleSort("ownershipPct")} className="inline-flex w-full items-center justify-end gap-1">
                  <span>Own%</span>
                  <span aria-hidden="true">{sortArrow("ownershipPct")}</span>
                </button>
              </th>
              <th className="sticky top-0 z-20 w-20 min-w-20 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                <button type="button" onClick={() => handleSort("seasonPts")} className="inline-flex w-full items-center justify-end gap-1">
                  <span>Season Pts</span>
                  <span aria-hidden="true">{sortArrow("seasonPts")}</span>
                </button>
              </th>
              <th className="sticky top-0 z-20 w-24 min-w-24 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                <button type="button" onClick={() => handleSort("statusLabel")} className="inline-flex items-center gap-1">
                  <span>Status</span>
                  <span aria-hidden="true">{sortArrow("statusLabel")}</span>
                </button>
              </th>
              <th className="sticky top-0 z-20 w-24 min-w-24 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                <button type="button" onClick={() => handleSort("chanceThisRound")} className="inline-flex w-full items-center justify-end gap-1">
                  <span>This Rd %</span>
                  <span aria-hidden="true">{sortArrow("chanceThisRound")}</span>
                </button>
              </th>
              <th className="sticky top-0 z-20 w-24 min-w-24 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                <button type="button" onClick={() => handleSort("chanceNextRound")} className="inline-flex w-full items-center justify-end gap-1">
                  <span>Next Rd %</span>
                  <span aria-hidden="true">{sortArrow("chanceNextRound")}</span>
                </button>
              </th>
              <th className="sticky top-0 z-20 w-64 min-w-64 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                Description
              </th>
              <th className="sticky top-0 z-20 w-16 min-w-16 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                Link
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSorted.map((player, index) => {
              const rowHref = `/portal/players/${player.id}`;
              const rowShade = index % 2 === 0 ? "bg-white" : "bg-slate-50";

              return (
                <tr
                  key={player.id}
                  className={`group ${rowShade} cursor-pointer text-brand-dark transition-colors hover:bg-brand-green/10`}
                  onClick={() => router.push(rowHref)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(rowHref);
                    }
                  }}
                  role="link"
                  tabIndex={0}
                >
                  <td className={`sticky left-0 z-20 w-10 min-w-10 border-b border-r border-slate-200 px-1 py-1.5 text-center ${rowShade} group-hover:bg-brand-green/10`}>
                    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${positionBadgeClass(player.position)}`}>
                      {player.position.charAt(0)}
                    </span>
                  </td>
                  <td className={`sticky left-10 z-20 w-48 min-w-48 max-w-48 border-b border-r border-slate-200 px-2 py-1.5 font-semibold text-brand-dark ${rowShade} group-hover:bg-brand-green/10`}>
                    <span className="block truncate">{player.name}</span>
                  </td>
                  <td className="border-b border-r border-slate-200 px-2 py-1.5 font-medium text-slate-600">{player.team}</td>
                  <td className="border-b border-r border-slate-200 px-2 py-1.5 text-right font-medium tabular-nums text-slate-600">
                    {player.ownershipPct.toFixed(1)}%
                  </td>
                  <td className="border-b border-r border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums text-brand-dark">{player.seasonPts.toFixed(0)}</td>
                  <td className="border-b border-r border-slate-200 px-2 py-1.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${statusBadgeClass(player.statusLabel)}`}>{player.statusLabel}</span>
                  </td>
                  <td className="border-b border-r border-slate-200 px-2 py-1.5 text-right font-medium tabular-nums text-slate-600">{formatChance(player.chanceThisRound)}</td>
                  <td className="border-b border-r border-slate-200 px-2 py-1.5 text-right font-medium tabular-nums text-slate-600">{formatChance(player.chanceNextRound)}</td>
                  <td className="border-b border-r border-slate-200 px-2 py-1.5 text-slate-600">
                    <span className="block max-w-[16rem] truncate" title={player.description ?? undefined}>
                      {player.description ?? "-"}
                    </span>
                  </td>
                  <td className="border-b border-r border-slate-200 px-2 py-1.5 text-center">
                    {player.scoutLink ? (
                      <a
                        href={player.scoutLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="font-semibold text-brand-green underline underline-offset-2 hover:opacity-80"
                      >
                        Link
                      </a>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredAndSorted.length === 0 ? (
              <tr>
                <td colSpan={10} className="border-b border-slate-200 bg-slate-50 px-4 py-6 text-center text-slate-500">
                  No injuries or suspensions match the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
