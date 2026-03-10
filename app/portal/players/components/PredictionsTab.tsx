"use client";

import { useEffect, useMemo, useState } from "react";
import AvailabilityIcon from "@/app/components/ui/AvailabilityIcon";

type PositionFilter = "All" | "G" | "D" | "M" | "F";
type SortKey = "predictedPts" | "playerName";
type SortDir = "asc" | "desc";

type PredictionRow = {
  playerId: string;
  playerName: string;
  team: string;
  position: "G" | "D" | "M" | "F";
  ownershipPct: number;
  opponentAbbrev: string | null;
  opponentName: string | null;
  isHome: boolean | null;
  predictedPts: number | null;
  startProbability: number | null;
  expectedMinutes: number | null;
  formSignal: number | null;
  fixtureScore: number | null;
  homeAwayAdj: number | null;
  consistencyPts: number | null;
  minutesModifier: number | null;
  volatilityLabel: string | null;
  trend: "up" | "down" | "flat";
  generatedAt: string | null;
  fixtureDifficulty: "easy" | "medium" | "hard" | "unknown";
  chanceOfPlaying: number | null;
  availabilityStatus: string | null;
  availabilityNews: string | null;
};

type RankedPredictionRow = PredictionRow & {
  overallRank: number;
  positionRank: number;
};

type PredictionsResponse = {
  success: boolean;
  rows: PredictionRow[];
  message?: string;
};

type PredictionsTabProps = {
  season: string;
  currentGw: number;
};

const positionFilters: PositionFilter[] = ["All", "G", "D", "M", "F"];

const positionBadgeClass: Record<"G" | "D" | "M" | "F", string> = {
  G: "bg-brand-green",
  D: "bg-brand-greenDark",
  M: "bg-[#1e3325]",
  F: "bg-[#27412d]",
};

const volatilityClass: Record<"reliable" | "mixed" | "boom_bust", string> = {
  reliable: "border-green-300/40 bg-green-500/20 text-green-100",
  mixed: "border-amber-300/40 bg-amber-500/20 text-amber-100",
  boom_bust: "border-red-300/40 bg-red-500/20 text-red-100",
};

const trendClass: Record<"up" | "down" | "flat", string> = {
  up: "text-green-300",
  down: "text-red-300",
  flat: "text-brand-creamDark",
};

const fixtureClass: Record<"easy" | "medium" | "hard" | "unknown", string> = {
  easy: "bg-[#2a7a3b] text-brand-cream",
  medium: "bg-[#eab308] text-[#0f1f13]",
  hard: "bg-[#ef4444] text-brand-cream",
  unknown: "bg-brand-dark text-brand-creamDark",
};

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleString();
}

function trendGlyph(trend: PredictionRow["trend"]): string {
  if (trend === "up") {
    return "▲";
  }
  if (trend === "down") {
    return "▼";
  }
  return "→";
}

function formatStartProbability(value: number | null): string {
  if (value == null) {
    return "-";
  }

  return `${Math.round(value * 100)}%`;
}

function formatExpectedMinutes(value: number | null): string {
  if (value == null) {
    return "-";
  }

  return String(Math.round(value));
}

function volatilityMeta(label: string | null): { emoji: string; text: string; className: string } {
  if (label === "reliable") {
    return { emoji: "🟢", text: "Reliable", className: volatilityClass.reliable };
  }
  if (label === "boom_bust") {
    return { emoji: "🔴", text: "Boom/Bust", className: volatilityClass.boom_bust };
  }
  if (label === "mixed") {
    return { emoji: "🟡", text: "Mixed", className: volatilityClass.mixed };
  }

  return {
    emoji: "-",
    text: "-",
    className: "border-brand-cream/20 bg-brand-dark text-brand-creamDark",
  };
}

function compareForRanking(a: PredictionRow, b: PredictionRow): number {
  const aScore = a.predictedPts;
  const bScore = b.predictedPts;

  if (aScore == null && bScore == null) {
    return a.playerName.localeCompare(b.playerName);
  }

  if (aScore == null) {
    return 1;
  }

  if (bScore == null) {
    return -1;
  }

  if (bScore !== aScore) {
    return bScore - aScore;
  }

  return a.playerName.localeCompare(b.playerName);
}

function withRanks(rows: PredictionRow[]): RankedPredictionRow[] {
  const sorted = [...rows].sort(compareForRanking);
  const positionCounters: Record<"G" | "D" | "M" | "F", number> = { G: 0, D: 0, M: 0, F: 0 };

  return sorted.map((row, index) => {
    positionCounters[row.position] += 1;

    return {
      ...row,
      overallRank: index + 1,
      positionRank: positionCounters[row.position],
    };
  });
}

export default function PredictionsTab({ season, currentGw }: PredictionsTabProps) {
  const [selectedGw, setSelectedGw] = useState(currentGw + 1);
  const [position, setPosition] = useState<PositionFilter>("All");
  const [rankedRows, setRankedRows] = useState<RankedPredictionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("predictedPts");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [searchPlayer, setSearchPlayer] = useState("");
  const [teamFilter, setTeamFilter] = useState("All");
  const [ownershipMin, setOwnershipMin] = useState("0");
  const [ownershipMax, setOwnershipMax] = useState("100");

  const gwOptions = useMemo(() => Array.from({ length: 5 }, (_, idx) => currentGw + idx + 1), [currentGw]);

  useEffect(() => {
    let alive = true;

    async function loadPredictions() {
      setLoading(true);

      const params = new URLSearchParams({
        season,
        gameweek: String(selectedGw),
        limit: "200",
      });

      if (position !== "All") {
        params.set("position", position);
      }

      try {
        const response = await fetch(`/api/predictions?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        });

        const payload = (await response.json()) as PredictionsResponse;
        if (!alive) {
          return;
        }

        if (!response.ok || !payload.success) {
          setRankedRows([]);
          setLoading(false);
          return;
        }

        setRankedRows(withRanks(payload.rows ?? []));
        setTeamFilter("All");
        setSearchPlayer("");
        setOwnershipMin("0");
        setOwnershipMax("100");
        setLoading(false);
      } catch {
        if (!alive) {
          return;
        }
        setRankedRows([]);
        setLoading(false);
      }
    }

    void loadPredictions();

    return () => {
      alive = false;
    };
  }, [position, season, selectedGw]);

  const teams = useMemo(() => {
    return [...new Set(rankedRows.map((row) => row.team))].sort((a, b) => a.localeCompare(b));
  }, [rankedRows]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchPlayer.trim().toLowerCase();
    const parsedOwnershipMin = Number(ownershipMin);
    const parsedOwnershipMax = Number(ownershipMax);
    const safeOwnershipMin = Number.isFinite(parsedOwnershipMin) ? parsedOwnershipMin : 0;
    const safeOwnershipMax = Number.isFinite(parsedOwnershipMax) ? parsedOwnershipMax : 100;
    const lowerOwnershipBound = Math.max(0, Math.min(safeOwnershipMin, safeOwnershipMax));
    const upperOwnershipBound = Math.min(100, Math.max(safeOwnershipMin, safeOwnershipMax));

    return rankedRows.filter((row) => {
      const matchesSearch = !normalizedSearch || row.playerName.toLowerCase().includes(normalizedSearch);
      const matchesTeam = teamFilter === "All" || row.team === teamFilter;
      const matchesOwnership = row.ownershipPct >= lowerOwnershipBound && row.ownershipPct <= upperOwnershipBound;
      return matchesSearch && matchesTeam && matchesOwnership;
    });
  }, [ownershipMax, ownershipMin, rankedRows, searchPlayer, teamFilter]);

  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows];

    sorted.sort((a, b) => {
      if (sortKey === "playerName") {
        const comparison = a.playerName.localeCompare(b.playerName);
        return sortDir === "asc" ? comparison : -comparison;
      }

      const aScore = a.predictedPts;
      const bScore = b.predictedPts;
      if (aScore == null && bScore == null) {
        return a.playerName.localeCompare(b.playerName);
      }
      if (aScore == null) {
        return 1;
      }
      if (bScore == null) {
        return -1;
      }

      return sortDir === "asc" ? aScore - bScore : bScore - aScore;
    });

    return sorted;
  }, [filteredRows, sortDir, sortKey]);

  const lastUpdated = rankedRows[0]?.generatedAt ?? null;

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDir(key === "playerName" ? "asc" : "desc");
  }

  const sortArrow = (key: SortKey) => {
    if (sortKey !== key) {
      return "↕";
    }

    return sortDir === "asc" ? "↑" : "↓";
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-brand-cream/20 bg-brand-dark px-3 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1">
            {gwOptions.map((gw) => {
              const active = selectedGw === gw;
              return (
                <button
                  key={gw}
                  type="button"
                  onClick={() => setSelectedGw(gw)}
                  className={`rounded-md border px-3 py-1 text-xs font-semibold ${
                    active
                      ? "border-brand-green bg-brand-green text-brand-cream"
                      : "border-brand-cream/35 bg-brand-dark text-brand-cream"
                  }`}
                >
                  GW {gw}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-1">
            {positionFilters.map((filter) => {
              const active = position === filter;
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setPosition(filter)}
                  className={`rounded-md border px-3 py-1 text-xs font-semibold ${
                    active
                      ? "border-brand-green bg-brand-green text-brand-cream"
                      : "border-brand-cream/35 bg-brand-dark text-brand-cream"
                  }`}
                >
                  {filter}
                </button>
              );
            })}
          </div>

          <p className="text-xs text-brand-creamDark">Predictions last updated: {formatTimestamp(lastUpdated)}</p>

          <div className="ml-auto">
            <span
              title="Projected points combine form (including ghost floor), fixture difficulty, home/away profile, consistency, and expected minutes."
              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-brand-cream/35 bg-brand-dark text-xs font-bold text-brand-cream"
            >
              ?
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-brand-cream/20 bg-brand-dark px-3 py-2">
        <div className="grid grid-cols-2 gap-2 text-xs md:flex md:flex-nowrap md:items-end md:gap-2">
          <label className="space-y-1 md:shrink-0">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Search player</span>
            <input
              value={searchPlayer}
              onChange={(event) => setSearchPlayer(event.target.value)}
              placeholder="Player"
              className="w-full rounded border border-brand-cream/35 bg-brand-dark px-2 py-1 text-xs text-brand-cream placeholder:text-brand-creamDark focus:border-brand-green focus:outline-none md:w-40"
            />
          </label>

          <label className="space-y-1 md:shrink-0">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Team</span>
            <select
              value={teamFilter}
              onChange={(event) => setTeamFilter(event.target.value)}
              className="w-full rounded border border-brand-cream/35 bg-brand-dark px-2 py-1 text-xs text-brand-cream focus:border-brand-green focus:outline-none md:w-24"
            >
              <option value="All">All</option>
              {teams.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </label>

          <div className="col-span-2 space-y-1 md:col-span-1 md:shrink-0">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Ownership %</span>
            <div className="grid grid-cols-2 gap-1 md:flex">
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={ownershipMin}
                onChange={(event) => setOwnershipMin(event.target.value)}
                placeholder="Min"
                className="w-full rounded border border-brand-cream/35 bg-brand-dark px-2 py-1 text-xs text-brand-cream md:w-16"
              />
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={ownershipMax}
                onChange={(event) => setOwnershipMax(event.target.value)}
                placeholder="Max"
                className="w-full rounded border border-brand-cream/35 bg-brand-dark px-2 py-1 text-xs text-brand-cream md:w-16"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-brand-cream/20">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="text-brand-creamDark">
            <tr>
              <th className="sticky left-0 top-0 z-20 border-b border-r border-brand-cream/35 bg-[#0F1F13] px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide">
                Rank
              </th>
              <th className="sticky top-0 z-10 border-b border-r border-brand-cream/35 bg-[#1a3a22] px-4 py-3 text-xs font-semibold uppercase tracking-wide">
                <button type="button" onClick={() => handleSort("playerName")} className="inline-flex items-center gap-1">
                  <span>Player</span>
                  <span aria-hidden="true">{sortArrow("playerName")}</span>
                </button>
              </th>
              <th className="sticky top-0 z-10 border-b border-r border-brand-cream/35 bg-[#1a3a22] px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-brand-cream">
                Fixture
              </th>
              <th className="sticky top-0 z-10 border-b border-r border-brand-cream/35 bg-[#1a3a22] px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-brand-cream">
                <button type="button" onClick={() => handleSort("predictedPts")} className="inline-flex items-center gap-1">
                  <span>Projected Pts</span>
                  <span aria-hidden="true">{sortArrow("predictedPts")}</span>
                </button>
              </th>
              <th className="sticky top-0 z-10 border-b border-r border-brand-cream/35 bg-[#1a3a22] px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-brand-cream">
                Start %
              </th>
              <th className="sticky top-0 z-10 border-b border-r border-brand-cream/35 bg-[#1a3a22] px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-brand-cream">
                Exp Mins
              </th>
              <th className="sticky top-0 z-10 border-b border-r border-brand-cream/35 bg-[#1a3a22] px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-brand-cream">
                Volatility
              </th>
              <th className="sticky top-0 z-10 hidden border-b border-brand-cream/35 bg-[#1a3a22] px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-brand-cream sm:table-cell">
                Trend
              </th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 8 }).map((_, index) => (
                  <tr key={`skeleton-${index}`} className={index % 2 === 0 ? "bg-brand-dark/60" : "bg-brand-dark/90"}>
                    <td className="border-b border-r border-brand-cream/10 px-3 py-3 text-center">
                      <div className="mx-auto h-5 w-8 animate-pulse rounded bg-brand-cream/10" />
                      <div className="mx-auto mt-1 h-3 w-10 animate-pulse rounded bg-brand-cream/10" />
                    </td>
                    <td className="border-b border-r border-brand-cream/10 px-4 py-3">
                      <div className="h-4 w-36 animate-pulse rounded bg-brand-cream/10" />
                      <div className="mt-2 h-3 w-24 animate-pulse rounded bg-brand-cream/10" />
                    </td>
                    <td className="border-b border-r border-brand-cream/10 px-4 py-3 text-center">
                      <div className="mx-auto h-6 w-20 animate-pulse rounded-md bg-brand-cream/10" />
                    </td>
                    <td className="border-b border-r border-brand-cream/10 px-4 py-3 text-center">
                      <div className="mx-auto h-5 w-12 animate-pulse rounded bg-brand-cream/10" />
                    </td>
                    <td className="border-b border-r border-brand-cream/10 px-4 py-3 text-center">
                      <div className="mx-auto h-5 w-12 animate-pulse rounded bg-brand-cream/10" />
                    </td>
                    <td className="border-b border-r border-brand-cream/10 px-4 py-3 text-center">
                      <div className="mx-auto h-5 w-12 animate-pulse rounded bg-brand-cream/10" />
                    </td>
                    <td className="border-b border-r border-brand-cream/10 px-4 py-3 text-center">
                      <div className="mx-auto h-6 w-20 animate-pulse rounded-full bg-brand-cream/10" />
                    </td>
                    <td className="hidden border-b border-brand-cream/10 px-4 py-3 text-center sm:table-cell">
                      <div className="mx-auto h-4 w-4 animate-pulse rounded bg-brand-cream/10" />
                    </td>
                  </tr>
                ))
              : null}

            {!loading && sortedRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="border-b border-brand-cream/10 bg-brand-dark/90 px-4 py-8 text-center text-sm text-brand-creamDark">
                  Predictions for this gameweek haven&apos;t been generated yet.
                </td>
              </tr>
            ) : null}

            {!loading
              ? sortedRows.map((row, index) => {
                  const shade = index % 2 === 0 ? "bg-brand-dark/60" : "bg-brand-dark/90";
                  const volatility = volatilityMeta(row.volatilityLabel);
                  const fixtureText = row.opponentAbbrev ? `${row.opponentAbbrev} (${row.isHome ? "H" : "A"})` : "TBD";

                  return (
                    <tr key={row.playerId} className={`text-brand-cream ${shade}`}>
                      <td className="border-b border-r border-brand-cream/10 px-3 py-3 text-center">
                        <div className="text-sm font-bold text-brand-cream">{row.overallRank}</div>
                        <div className="text-xs text-brand-creamDark/80">
                          {row.position} #{row.positionRank}
                        </div>
                      </td>

                      <td className="border-b border-r border-brand-cream/10 px-4 py-3">
                        <div className="flex items-center gap-1 font-semibold leading-tight">
                          <span>{row.playerName}</span>
                          <AvailabilityIcon
                            chanceOfPlaying={row.chanceOfPlaying}
                            status={row.availabilityStatus}
                            news={row.availabilityNews}
                          />
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-brand-creamDark/80">
                          <span className={`inline-flex rounded-full px-2 py-0.5 font-bold text-brand-cream ${positionBadgeClass[row.position]}`}>
                            {row.position}
                          </span>
                          <span>{row.team}</span>
                          <span>{row.ownershipPct.toFixed(1)}%</span>
                        </div>
                      </td>

                      <td className="border-b border-r border-brand-cream/10 px-4 py-3 text-center">
                        <span className={`inline-flex rounded-md px-2 py-1 text-xs font-bold ${fixtureClass[row.fixtureDifficulty]}`}>
                          {fixtureText}
                        </span>
                      </td>

                      <td className="border-b border-r border-brand-cream/10 px-4 py-3 text-center text-sm font-bold">
                        {row.predictedPts == null ? "-" : row.predictedPts.toFixed(1)}
                      </td>

                      <td className="border-b border-r border-brand-cream/10 px-4 py-3 text-center text-sm font-semibold">
                        {formatStartProbability(row.startProbability)}
                      </td>

                      <td className="border-b border-r border-brand-cream/10 px-4 py-3 text-center text-sm font-semibold">
                        {formatExpectedMinutes(row.expectedMinutes)}
                      </td>

                      <td className="border-b border-r border-brand-cream/10 px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${volatility.className}`}>
                          <span>{volatility.emoji}</span>
                          <span className="hidden sm:inline">{volatility.text}</span>
                        </span>
                      </td>

                      <td className={`hidden border-b border-brand-cream/10 px-4 py-3 text-center text-sm font-bold sm:table-cell ${trendClass[row.trend]}`}>
                        {trendGlyph(row.trend)}
                      </td>
                    </tr>
                  );
                })
              : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
