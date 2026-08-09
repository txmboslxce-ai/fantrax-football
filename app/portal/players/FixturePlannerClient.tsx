"use client";

import { createClient } from "@/lib/supabase";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AvailabilityIcon from "@/app/components/ui/AvailabilityIcon";
import RosterPill from "@/app/components/ui/RosterPill";
import type { LeagueRosterData } from "@/lib/portal/leagueRoster";

type PlayerGameweekJoinedRow = {
  player_id: string;
  gameweek: number;
  games_played: number | null;
  raw_fantrax_pts: number | string | null;
  players:
    | {
        id: string;
        name: string;
        team: string;
        position: string;
        ownership_pct: string | null;
        fpl_player_data:
          | {
              chance_of_playing_next_round: number | null;
              status: string | null;
              news: string | null;
            }
          | Array<{
              chance_of_playing_next_round: number | null;
              status: string | null;
              news: string | null;
            }>
          | null;
      }
    | Array<{
        id: string;
        name: string;
        team: string;
        position: string;
        ownership_pct: string | null;
        fpl_player_data:
          | {
              chance_of_playing_next_round: number | null;
              status: string | null;
              news: string | null;
            }
          | Array<{
              chance_of_playing_next_round: number | null;
              status: string | null;
              news: string | null;
            }>
          | null;
      }>
    | null;
};

type LatestGwRow = {
  gameweek: number;
};

type FixtureRow = {
  id: string;
  gameweek: number;
  home_team: string;
  away_team: string;
};

type TeamRow = {
  abbrev: string;
};

type Position = "GK" | "DEF" | "MID" | "FWD";
type PositionLetter = "G" | "D" | "M" | "F";
type SortDirection = "asc" | "desc";

type PlayerPlannerRow = {
  id: string;
  name: string;
  team: string;
  position: Position;
  ownershipPct: number;
  seasonPts: number;
  chanceOfPlaying: number | null;
  availabilityStatus: string | null;
  availabilityNews: string | null;
};

type FixtureCell = {
  opponent: string;
  isHome: boolean;
};

const positionFilters: Array<"All" | Position> = ["All", "GK", "DEF", "MID", "FWD"];

function mapPosition(position: string): Position {
  switch (position) {
    case "G":
      return "GK";
    case "D":
      return "DEF";
    case "M":
      return "MID";
    case "F":
      return "FWD";
    default:
      return "MID";
  }
}

function positionLetter(position: Position): PositionLetter {
  switch (position) {
    case "GK":
      return "G";
    case "DEF":
      return "D";
    case "MID":
      return "M";
    case "FWD":
      return "F";
  }
}

function parseOwnership(value: string | null): number {
  if (!value) {
    return 0;
  }

  const numeric = Number.parseFloat(value.replace("%", "").trim());
  return Number.isFinite(numeric) ? numeric : 0;
}

function toPoints(value: number | string | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function fdrColor(rank: number | undefined): string {
  if (rank == null) return "bg-slate-100 text-slate-500";
  if (rank <= 4) return "bg-red-100 text-red-800";
  if (rank <= 8) return "bg-orange-100 text-orange-800";
  if (rank <= 12) return "bg-yellow-100 text-yellow-800";
  if (rank <= 16) return "bg-lime-100 text-lime-800";
  return "bg-green-100 text-green-800";
}

export default function FixturePlannerClient({
  leagueRoster,
  season,
}: {
  leagueRoster: LeagueRosterData | null;
  season: string;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [rows, setRows] = useState<PlayerPlannerRow[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [latestGw, setLatestGw] = useState<number | null>(null);
  const [fixturesByTeamAndGw, setFixturesByTeamAndGw] = useState<Map<string, FixtureCell>>(new Map());
  const [difficultyRankByOpponentPos, setDifficultyRankByOpponentPos] = useState<Map<string, number>>(new Map());

  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<(typeof positionFilters)[number]>("All");
  const [teamFilter, setTeamFilter] = useState("All");
  const [ownershipMin, setOwnershipMin] = useState("0");
  const [ownershipMax, setOwnershipMax] = useState("100");
  const [availabilityFilter, setAvailabilityFilter] = useState<"All" | "Available" | "Taken" | "My Team">("All");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadFixturePlanner() {
      setLoading(true);
      setError(null);

      const [playerGwResult, latestGwResult, fixturesResult, teamsResult] = await Promise.all([
        supabase
          .from("player_gameweeks")
          .select(
            "player_id, gameweek, games_played, raw_fantrax_pts, players!inner(id, name, team, position, ownership_pct, fpl_player_data(chance_of_playing_next_round, status, news))"
          )
          .eq("season", season),
        supabase
          .from("player_gameweeks")
          .select("gameweek")
          .eq("season", season)
          .gt("games_played", 0)
          .order("gameweek", { ascending: false })
          .limit(1),
        supabase.from("fixtures").select("id, gameweek, home_team, away_team").eq("season", season).order("gameweek", { ascending: true }),
        supabase.from("teams").select("abbrev").order("abbrev"),
      ]);

      if (!alive) {
        return;
      }

      if (playerGwResult.error) {
        setError(`Unable to load player season data: ${playerGwResult.error.message}`);
        setLoading(false);
        return;
      }
      if (latestGwResult.error) {
        setError(`Unable to load latest gameweek: ${latestGwResult.error.message}`);
        setLoading(false);
        return;
      }
      if (fixturesResult.error) {
        setError(`Unable to load fixtures: ${fixturesResult.error.message}`);
        setLoading(false);
        return;
      }
      if (teamsResult.error) {
        setError(`Unable to load teams: ${teamsResult.error.message}`);
        setLoading(false);
        return;
      }

      const latestUploadedGw = ((latestGwResult.data ?? []) as LatestGwRow[])[0]?.gameweek ?? 0;
      const gameweekRows = (playerGwResult.data ?? []) as PlayerGameweekJoinedRow[];
      const fixtures = (fixturesResult.data ?? []) as FixtureRow[];
      const teamRows = (teamsResult.data ?? []) as TeamRow[];

      const seasonRowsByPlayer = new Map<string, PlayerPlannerRow>();
      for (const row of gameweekRows) {
        const player = Array.isArray(row.players) ? row.players[0] : row.players;
        if (!player) {
          continue;
        }

        const existing = seasonRowsByPlayer.get(row.player_id);
        const availabilityRaw = Array.isArray(player.fpl_player_data) ? player.fpl_player_data[0] : player.fpl_player_data;
        if (!existing) {
          seasonRowsByPlayer.set(row.player_id, {
            id: player.id,
            name: player.name,
            team: player.team,
            position: mapPosition(player.position),
            ownershipPct: parseOwnership(player.ownership_pct),
            seasonPts: toPoints(row.raw_fantrax_pts),
            chanceOfPlaying: availabilityRaw?.chance_of_playing_next_round ?? null,
            availabilityStatus: availabilityRaw?.status ?? null,
            availabilityNews: availabilityRaw?.news ?? null,
          });
          continue;
        }

        existing.seasonPts += toPoints(row.raw_fantrax_pts);
      }

      const allTeams = teamRows.map((team) => team.abbrev);
      const fixturesByGw = new Map<number, FixtureRow[]>();
      for (const fixture of fixtures) {
        const existing = fixturesByGw.get(fixture.gameweek) ?? [];
        existing.push(fixture);
        fixturesByGw.set(fixture.gameweek, existing);
      }

      const nextGws = Array.from({ length: 5 }, (_, i) => latestUploadedGw + i + 1);
      const fixtureLookup = new Map<string, FixtureCell>();

      for (const team of allTeams) {
        const nextFiveFixtures = fixtures
          .filter((fixture) => fixture.gameweek > latestUploadedGw && (fixture.home_team === team || fixture.away_team === team))
          .sort((a, b) => a.gameweek - b.gameweek)
          .slice(0, 5);

        for (const fixture of nextFiveFixtures) {
          const opponent = fixture.home_team === team ? fixture.away_team : fixture.home_team;
          const isHome = fixture.home_team === team;
          fixtureLookup.set(`${team}:${fixture.gameweek}`, { opponent, isHome });
        }

        for (const gw of nextGws) {
          if (!fixtureLookup.has(`${team}:${gw}`)) {
            continue;
          }
        }
      }

      // Conceded points lookup by opponent team and position using fixture-join logic.
      const difficultyTotals = new Map<string, number>();
      for (const row of gameweekRows) {
        const player = Array.isArray(row.players) ? row.players[0] : row.players;
        if (!player) {
          continue;
        }

        const gwFixtures = fixturesByGw.get(Number(row.gameweek ?? 0)) ?? [];
        const points = toPoints(row.raw_fantrax_pts);

        for (const fixture of gwFixtures) {
          let opponent: string | null = null;
          if (fixture.home_team === player.team) {
            opponent = fixture.away_team;
          } else if (fixture.away_team === player.team) {
            opponent = fixture.home_team;
          }

          if (!opponent) {
            continue;
          }

          const pos = player.position as PositionLetter;
          if (pos !== "G" && pos !== "D" && pos !== "M" && pos !== "F") {
            continue;
          }

          const key = `${opponent}:${pos}`;
          difficultyTotals.set(key, (difficultyTotals.get(key) ?? 0) + points);
        }
      }

      const difficultyRanks = new Map<string, number>();
      for (const pos of ["G", "D", "M", "F"] as const) {
        const rankedTeams = allTeams
          .map((team) => ({ team, value: difficultyTotals.get(`${team}:${pos}`) ?? 0 }))
          .sort((a, b) => a.value - b.value || a.team.localeCompare(b.team));
        for (const [index, entry] of rankedTeams.entries()) {
          difficultyRanks.set(`${entry.team}:${pos}`, index + 1);
        }
      }

      setRows(Array.from(seasonRowsByPlayer.values()).sort((a, b) => b.seasonPts - a.seasonPts));
      setTeams(allTeams);
      setLatestGw(latestUploadedGw);
      setFixturesByTeamAndGw(fixtureLookup);
      setDifficultyRankByOpponentPos(difficultyRanks);
      setLoading(false);
    }

    void loadFixturePlanner();

    return () => {
      alive = false;
    };
  }, [supabase, season]);

  const nextGws = useMemo(() => {
    if (latestGw == null) {
      return [] as number[];
    }
    return Array.from({ length: 5 }, (_, i) => latestGw + i + 1);
  }, [latestGw]);

  const filteredAndSortedRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const parsedOwnershipMin = Number(ownershipMin);
    const parsedOwnershipMax = Number(ownershipMax);
    const safeOwnershipMin = Number.isFinite(parsedOwnershipMin) ? parsedOwnershipMin : 0;
    const safeOwnershipMax = Number.isFinite(parsedOwnershipMax) ? parsedOwnershipMax : 100;
    const lowerOwnershipBound = Math.max(0, Math.min(safeOwnershipMin, safeOwnershipMax));
    const upperOwnershipBound = Math.min(100, Math.max(safeOwnershipMin, safeOwnershipMax));

    const filtered = rows.filter((row) => {
      const matchesPosition = positionFilter === "All" || row.position === positionFilter;
      const matchesTeam = teamFilter === "All" || row.team === teamFilter;
      const matchesSearch = !normalizedSearch || row.name.toLowerCase().includes(normalizedSearch);
      const matchesOwnership = row.ownershipPct >= lowerOwnershipBound && row.ownershipPct <= upperOwnershipBound;
      const isTaken = leagueRoster ? Boolean(leagueRoster.teamByPlayerId[row.id]) : false;
      const isMyTeam = leagueRoster ? leagueRoster.myTeamPlayerIds.includes(row.id) : false;
      const matchesAvailability =
        availabilityFilter === "All" ||
        (availabilityFilter === "Available" && !isTaken) ||
        (availabilityFilter === "Taken" && isTaken) ||
        (availabilityFilter === "My Team" && isMyTeam);
      return matchesPosition && matchesTeam && matchesSearch && matchesOwnership && matchesAvailability;
    });

    return [...filtered].sort((a, b) => (sortDirection === "desc" ? b.seasonPts - a.seasonPts : a.seasonPts - b.seasonPts));
  }, [availabilityFilter, leagueRoster, ownershipMax, ownershipMin, positionFilter, rows, search, sortDirection, teamFilter]);

  const sortArrow = sortDirection === "asc" ? "↑" : "↓";

  if (error) {
    return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>;
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
        Loading fixture planner...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="overflow-x-auto">
          <div className="flex min-w-max items-stretch gap-2 text-xs">
            <label className="shrink-0 space-y-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2">
              <span className="block font-semibold uppercase tracking-wide text-slate-600">Search player</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Player"
                className="w-44 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-brand-dark placeholder:text-slate-400 focus:border-brand-green focus:outline-none"
              />
            </label>

            <div className="shrink-0 space-y-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2">
              <span className="block font-semibold uppercase tracking-wide text-slate-600">Position</span>
              <div className="flex gap-1">
                {positionFilters.map((filter) => {
                  const active = positionFilter === filter;
                  return (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setPositionFilter(filter)}
                      className={`rounded-md border px-3 py-1 text-xs font-semibold ${
                        active
                          ? "border-brand-green bg-brand-green text-brand-cream"
                          : "border-slate-300 bg-white text-brand-dark hover:bg-slate-50"
                      }`}
                    >
                      {filter}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="shrink-0 space-y-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2">
              <span className="block font-semibold uppercase tracking-wide text-slate-600">Team</span>
              <select
                value={teamFilter}
                onChange={(event) => setTeamFilter(event.target.value)}
                className="w-24 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-brand-dark focus:border-brand-green focus:outline-none"
              >
                <option value="All">All</option>
                {teams.map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>
            </label>

            <div className="shrink-0 space-y-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2">
              <span className="block font-semibold uppercase tracking-wide text-slate-600">Ownership %</span>
              <div className="flex gap-1">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={ownershipMin}
                  onChange={(event) => setOwnershipMin(event.target.value)}
                  placeholder="Min"
                  className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-brand-dark focus:border-brand-green focus:outline-none"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={ownershipMax}
                  onChange={(event) => setOwnershipMax(event.target.value)}
                  placeholder="Max"
                  className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-brand-dark focus:border-brand-green focus:outline-none"
                />
              </div>
            </div>

            {leagueRoster ? (
              <div className="shrink-0 space-y-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2">
                <span className="block font-semibold uppercase tracking-wide text-slate-600">Availability</span>
                <div className="flex gap-1">
                  {(["All", "Available", "Taken"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setAvailabilityFilter(option)}
                      className={`rounded-md border px-3 py-1 text-xs font-semibold ${
                        availabilityFilter === option
                          ? "border-brand-green bg-brand-green text-brand-cream"
                          : "border-slate-300 bg-white text-brand-dark hover:bg-slate-50"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                  {leagueRoster.myTeamPlayerIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setAvailabilityFilter("My Team")}
                      className={`rounded-md border px-3 py-1 text-xs font-semibold ${
                        availabilityFilter === "My Team"
                          ? "border-brand-green bg-brand-green text-brand-cream"
                          : "border-slate-300 bg-white text-brand-dark hover:bg-slate-50"
                      }`}
                    >
                      My Team
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="max-w-full overflow-x-auto">
        <div className="max-h-[75vh] w-max overflow-y-auto rounded-lg border border-slate-200 bg-white [scrollbar-gutter:stable]">
        <table className="border-separate border-spacing-0 text-left text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 w-64 min-w-64 border-b border-r border-brand-cream/25 bg-brand-green px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                Name
              </th>
              <th className="sticky top-0 z-20 w-24 min-w-24 border-b border-r border-brand-cream/25 bg-brand-green px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                <button
                  type="button"
                  onClick={() => setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))}
                  className="inline-flex items-center justify-center gap-1"
                >
                  <span>Fant Pts</span>
                  <span aria-hidden="true">{sortArrow}</span>
                </button>
              </th>
              {nextGws.map((gw) => (
                <th
                  key={gw}
                  className="sticky top-0 z-20 w-20 min-w-20 border-b border-r border-brand-cream/25 bg-brand-green px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-brand-cream last:border-r-0"
                >
                  GW{gw}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedRows.map((row, index) => {
              const rowShade = index % 2 === 0 ? "bg-white" : "bg-slate-50";

              return (
                <tr key={row.id} className={`group ${rowShade} text-brand-dark transition-colors hover:bg-brand-green/10`}>
                  <td className={`sticky left-0 z-20 w-64 min-w-64 border-b border-r border-slate-200 px-3 py-2 ${rowShade} group-hover:bg-brand-green/10`}>
                    <Link href={`/portal/players/${row.id}`} prefetch={false} className="block hover:text-brand-green hover:underline">
                      <div className="flex flex-wrap items-center gap-1 font-semibold leading-tight">
                        <span>{row.name}</span>
                        {leagueRoster?.myTeamPlayerIds.includes(row.id) ? <span className="text-[10px] text-brand-green" title="My Team">★</span> : null}
                        <AvailabilityIcon
                          chanceOfPlaying={row.chanceOfPlaying}
                          status={row.availabilityStatus}
                          news={row.availabilityNews}
                        />
                        <RosterPill playerId={row.id} leagueRoster={leagueRoster} />
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {row.team} / {positionLetter(row.position)} / {row.ownershipPct.toFixed(1)}%
                      </div>
                    </Link>
                  </td>

                  <td className="w-24 min-w-24 border-b border-r border-slate-200 px-3 py-2 text-center font-semibold tabular-nums text-brand-dark">
                    {row.seasonPts.toFixed(2)}
                  </td>

                  {nextGws.map((gw) => {
                    const fixture = fixturesByTeamAndGw.get(`${row.team}:${gw}`);
                    if (!fixture) {
                      return (
                        <td key={`${row.id}-${gw}`} className="w-20 min-w-20 border-b border-r border-slate-200 px-3 py-2 text-center last:border-r-0">
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-500">BGW</span>
                        </td>
                      );
                    }

                    const pos = positionLetter(row.position);
                    const difficultyRank = difficultyRankByOpponentPos.get(`${fixture.opponent}:${pos}`);

                    return (
                      <td key={`${row.id}-${gw}`} className="w-20 min-w-20 border-b border-r border-slate-200 px-3 py-2 text-center last:border-r-0">
                        <div className={`inline-flex rounded px-2 py-0.5 text-xs font-bold ${fdrColor(difficultyRank)}`}>
                          {fixture.opponent}
                        </div>
                        <div className="mt-1 text-[11px] font-semibold text-slate-500">{fixture.isHome ? "H" : "A"}</div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
