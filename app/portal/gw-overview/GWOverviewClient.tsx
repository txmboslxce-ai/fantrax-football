"use client";

import Link from "next/link";
import { Fragment, type CSSProperties, useMemo, useState } from "react";

export type GWOverviewTeam = string;

export type GWOverviewPlayer = {
  id: string;
  name: string;
  team: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  ownershipPct: number;
};

export type GWOverviewGameweekRow = {
  id: string;
  player_id: string;
  season: string;
  gameweek: number;
  games_played: number;
  games_started: number;
  minutes_played: number;
  raw_fantrax_pts: number;
  ghost_pts: number;
  goals: number;
  assists: number;
  key_passes: number;
  shots_on_target: number;
  penalties_drawn: number;
  penalties_missed: number;
  clean_sheet: number;
  tackles_won: number;
  interceptions: number;
  clearances: number;
  aerials_won: number;
  blocked_shots: number;
  dribbles_succeeded: number;
  goals_against_outfield: number;
  saves: number;
  goals_against: number;
  penalty_saves: number;
  high_claims: number;
  smothers: number;
  yellow_cards: number;
  red_cards: number;
  own_goals: number;
};

type PositionFilter = "All" | "GK" | "DEF" | "MID" | "FWD";
type GWStartedFilter = "Any" | number;

type StatOption = {
  label: string;
  value: StatKey;
};

type StatSelectEntry =
  | {
      type: "heading";
      label: string;
      key: string;
    }
  | {
      type: "option";
      label: string;
      value: StatKey;
      key: string;
    };

type StatSection = {
  heading: string;
  options: StatOption[];
};

type GWOverviewClientProps = {
  players: GWOverviewPlayer[];
  gameweeks: GWOverviewGameweekRow[];
  gameweekList: number[];
  teams: GWOverviewTeam[];
};

type StatKey =
  | "raw_fantrax_pts"
  | "ghost_pts"
  | "goals"
  | "assists"
  | "key_passes"
  | "shots_on_target"
  | "penalties_drawn"
  | "penalties_missed"
  | "clean_sheet"
  | "tackles_won"
  | "interceptions"
  | "clearances"
  | "aerials_won"
  | "blocked_shots"
  | "dribbles_succeeded"
  | "goals_against_outfield"
  | "saves"
  | "goals_against"
  | "penalty_saves"
  | "high_claims"
  | "smothers"
  | "yellow_cards"
  | "red_cards"
  | "own_goals";

const positionFilters: PositionFilter[] = ["All", "GK", "DEF", "MID", "FWD"];

const statSections: StatSection[] = [
  {
    heading: "Scoring",
    options: [
      { label: "Points", value: "raw_fantrax_pts" },
      { label: "Ghost Points", value: "ghost_pts" },
    ],
  },
  {
    heading: "Attack",
    options: [
      { label: "Goals", value: "goals" },
      { label: "Assists", value: "assists" },
      { label: "Key Passes", value: "key_passes" },
      { label: "Shots on Target", value: "shots_on_target" },
      { label: "Penalties Drawn", value: "penalties_drawn" },
      { label: "Penalties Missed", value: "penalties_missed" },
    ],
  },
  {
    heading: "Defensive",
    options: [
      { label: "Clean Sheet", value: "clean_sheet" },
      { label: "Tackles Won", value: "tackles_won" },
      { label: "Interceptions", value: "interceptions" },
      { label: "Clearances", value: "clearances" },
      { label: "Aerials Won", value: "aerials_won" },
      { label: "Blocked Shots", value: "blocked_shots" },
      { label: "Dribbles Succeeded", value: "dribbles_succeeded" },
      { label: "Goals Against Outfield", value: "goals_against_outfield" },
    ],
  },
  {
    heading: "Goalkeeper",
    options: [
      { label: "Saves", value: "saves" },
      { label: "Goals Against", value: "goals_against" },
      { label: "Penalty Saves", value: "penalty_saves" },
      { label: "High Claims", value: "high_claims" },
      { label: "Smothers", value: "smothers" },
    ],
  },
  {
    heading: "Disciplinary",
    options: [
      { label: "Yellow Cards", value: "yellow_cards" },
      { label: "Red Cards", value: "red_cards" },
      { label: "Own Goals", value: "own_goals" },
    ],
  },
];

const statSelectEntries: StatSelectEntry[] = statSections.flatMap((section) => [
  {
    type: "heading" as const,
    label: `── ${section.heading} ──`,
    key: `heading-${section.heading}`,
  },
  ...section.options.map((option) => ({
    type: "option" as const,
    label: `  ${option.label}`,
    value: option.value,
    key: `option-${option.value}`,
  })),
]);

const goalkeeperOnlyStats = new Set<StatKey>(["saves", "goals_against", "penalty_saves", "high_claims", "smothers"]);
const outfieldOnlyStats = new Set<StatKey>(["goals_against_outfield"]);

const CELL_WIDTHS = {
  player: 220,
  team: 80,
  pos: 80,
  ros: 90,
  stat: 84,
  gp: 96,
  mins: 72,
};

const STICKY_LEFT = {
  player: 0,
  team: CELL_WIDTHS.player,
  pos: CELL_WIDTHS.player + CELL_WIDTHS.team,
  ros: CELL_WIDTHS.player + CELL_WIDTHS.team + CELL_WIDTHS.pos,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mixColor(a: [number, number, number], b: [number, number, number], ratio: number): string {
  const safeRatio = clamp(ratio, 0, 1);
  const r = Math.round(a[0] + (b[0] - a[0]) * safeRatio);
  const g = Math.round(a[1] + (b[1] - a[1]) * safeRatio);
  const blue = Math.round(a[2] + (b[2] - a[2]) * safeRatio);
  return `rgb(${r}, ${g}, ${blue})`;
}

function pointsGradientBackground(value: number): string {
  const min = 4;
  const mid = 8;
  const max = 20;
  const red: [number, number, number] = [239, 68, 68];
  const yellow: [number, number, number] = [234, 179, 8];
  const green: [number, number, number] = [42, 122, 59];

  if (value <= min) {
    return "#ef4444";
  }
  if (value >= max) {
    return "#2A7A3B";
  }
  if (value <= mid) {
    return mixColor(red, yellow, (value - min) / (mid - min));
  }

  return mixColor(yellow, green, (value - mid) / (max - mid));
}

function toDisplayValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function isStatApplicable(position: GWOverviewPlayer["position"], stat: StatKey): boolean {
  if (goalkeeperOnlyStats.has(stat)) {
    return position === "GK";
  }
  if (outfieldOnlyStats.has(stat)) {
    return position !== "GK";
  }
  return true;
}

function gpStatus(row: GWOverviewGameweekRow): "Started" | "Sub" | "DNP" {
  if (row.games_played === 0) {
    return "DNP";
  }
  if (row.games_started >= 1) {
    return "Started";
  }
  return "Sub";
}

function gpStatusClasses(status: "Started" | "Sub" | "DNP") {
  if (status === "Started") {
    return "bg-[#bbf7d0] text-[#0f1f13]";
  }
  if (status === "Sub") {
    return "bg-[#fef08a] text-[#0f1f13]";
  }
  return "bg-[#fecaca] text-[#0f1f13]";
}

export default function GWOverviewClient({ players, gameweeks, gameweekList, teams }: GWOverviewClientProps) {
  const [selectedStat, setSelectedStat] = useState<StatKey>("raw_fantrax_pts");
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("All");
  const [teamFilter, setTeamFilter] = useState<string>("All");
  const [ownershipMin, setOwnershipMin] = useState<string>("0");
  const [ownershipMax, setOwnershipMax] = useState<string>("100");
  const [gwStartedFilter, setGwStartedFilter] = useState<GWStartedFilter>("Any");
  const [minSeasonPoints, setMinSeasonPoints] = useState<string>("0");

  const rowsByPlayerByGw = useMemo(() => {
    const map = new Map<string, Map<number, GWOverviewGameweekRow>>();

    for (const row of gameweeks) {
      if (!map.has(row.player_id)) {
        map.set(row.player_id, new Map<number, GWOverviewGameweekRow>());
      }
      map.get(row.player_id)?.set(row.gameweek, row);
    }

    return map;
  }, [gameweeks]);

  const totalPointsByPlayer = useMemo(() => {
    const totals = new Map<string, number>();

    for (const row of gameweeks) {
      totals.set(row.player_id, (totals.get(row.player_id) ?? 0) + Number(row.raw_fantrax_pts ?? 0));
    }

    return totals;
  }, [gameweeks]);

  const filteredPlayers = useMemo(() => {
    const minOwnership = ownershipMin.trim() === "" ? Number.NEGATIVE_INFINITY : Number.parseFloat(ownershipMin);
    const maxOwnership = ownershipMax.trim() === "" ? Number.POSITIVE_INFINITY : Number.parseFloat(ownershipMax);
    const minPoints = minSeasonPoints.trim() === "" ? Number.NEGATIVE_INFINITY : Number.parseFloat(minSeasonPoints);

    return players
      .filter((player) => {
        if (positionFilter !== "All" && player.position !== positionFilter) {
          return false;
        }

        if (teamFilter !== "All" && player.team !== teamFilter) {
          return false;
        }

        if (Number.isFinite(minOwnership) && player.ownershipPct < minOwnership) {
          return false;
        }

        if (Number.isFinite(maxOwnership) && player.ownershipPct > maxOwnership) {
          return false;
        }

        const seasonPoints = totalPointsByPlayer.get(player.id) ?? 0;
        if (Number.isFinite(minPoints) && seasonPoints < minPoints) {
          return false;
        }

        if (gwStartedFilter !== "Any") {
          const gwRow = rowsByPlayerByGw.get(player.id)?.get(gwStartedFilter);
          if (!gwRow || gwRow.games_started < 1) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        const aPoints = totalPointsByPlayer.get(a.id) ?? 0;
        const bPoints = totalPointsByPlayer.get(b.id) ?? 0;

        if (bPoints !== aPoints) {
          return bPoints - aPoints;
        }

        return a.name.localeCompare(b.name);
      });
  }, [gwStartedFilter, minSeasonPoints, ownershipMax, ownershipMin, players, positionFilter, rowsByPlayerByGw, teamFilter, totalPointsByPlayer]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-brand-cream/20 bg-brand-dark/80 p-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <label className="space-y-1 text-xs">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Stat</span>
            <select
              value={selectedStat}
              onChange={(event) => setSelectedStat(event.target.value as StatKey)}
              className="w-full rounded-md border border-brand-cream/35 bg-brand-dark px-3 py-2 text-sm text-brand-cream focus:border-brand-green focus:outline-none"
            >
              {statSelectEntries.map((entry) =>
                entry.type === "heading" ? (
                  <option key={entry.key} disabled style={{ color: "#9ca3af", fontStyle: "italic" }}>
                    {entry.label}
                  </option>
                ) : (
                  <option key={entry.key} value={entry.value}>
                    {entry.label}
                  </option>
                )
              )}
            </select>
          </label>

          <div className="space-y-1 text-xs">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Position</span>
            <div className="flex flex-wrap gap-1.5">
              {positionFilters.map((filter) => {
                const active = positionFilter === filter;
                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setPositionFilter(filter)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                      active
                        ? "border-brand-green bg-brand-green text-brand-cream"
                        : "border-brand-cream/40 bg-brand-dark text-brand-cream hover:bg-brand-cream/10"
                    }`}
                  >
                    {filter}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="space-y-1 text-xs">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Team</span>
            <select
              value={teamFilter}
              onChange={(event) => setTeamFilter(event.target.value)}
              className="w-full rounded-md border border-brand-cream/35 bg-brand-dark px-3 py-2 text-sm text-brand-cream focus:border-brand-green focus:outline-none"
            >
              <option value="All">All Teams</option>
              {teams.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-1 text-xs">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Ownership %</span>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={ownershipMin}
                onChange={(event) => setOwnershipMin(event.target.value)}
                placeholder="Min"
                className="w-full rounded-md border border-brand-cream/35 bg-brand-dark px-3 py-2 text-sm text-brand-cream placeholder:text-brand-creamDark focus:border-brand-green focus:outline-none"
              />
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={ownershipMax}
                onChange={(event) => setOwnershipMax(event.target.value)}
                placeholder="Max"
                className="w-full rounded-md border border-brand-cream/35 bg-brand-dark px-3 py-2 text-sm text-brand-cream placeholder:text-brand-creamDark focus:border-brand-green focus:outline-none"
              />
            </div>
          </div>

          <label className="space-y-1 text-xs">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">GW Started</span>
            <select
              value={gwStartedFilter === "Any" ? "Any" : String(gwStartedFilter)}
              onChange={(event) => {
                const value = event.target.value;
                setGwStartedFilter(value === "Any" ? "Any" : Number(value));
              }}
              className="w-full rounded-md border border-brand-cream/35 bg-brand-dark px-3 py-2 text-sm text-brand-cream focus:border-brand-green focus:outline-none"
            >
              <option value="Any">Any GW</option>
              {gameweekList.map((gw) => (
                <option key={gw} value={gw}>{`Started in GW${gw}`}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Min Season Points</span>
            <input
              type="number"
              step="0.1"
              value={minSeasonPoints}
              onChange={(event) => setMinSeasonPoints(event.target.value)}
              className="w-full rounded-md border border-brand-cream/35 bg-brand-dark px-3 py-2 text-sm text-brand-cream focus:border-brand-green focus:outline-none"
            />
          </label>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-brand-cream/20">
        <table className="border-separate border-spacing-0 text-sm" style={{ minWidth: STICKY_LEFT.ros + CELL_WIDTHS.ros + gameweekList.length * 252 }}>
          <thead>
            <tr>
              <th
                rowSpan={2}
                className="sticky left-0 top-0 z-30 border-b border-r border-brand-cream/25 bg-brand-dark px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-brand-creamDark"
                style={{ minWidth: CELL_WIDTHS.player, width: CELL_WIDTHS.player }}
              >
                Player
              </th>
              <th
                rowSpan={2}
                className="sticky top-0 z-30 border-b border-r border-brand-cream/25 bg-brand-dark px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-brand-creamDark"
                style={{ left: STICKY_LEFT.team, minWidth: CELL_WIDTHS.team, width: CELL_WIDTHS.team }}
              >
                Team
              </th>
              <th
                rowSpan={2}
                className="sticky top-0 z-30 border-b border-r border-brand-cream/25 bg-brand-dark px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-brand-creamDark"
                style={{ left: STICKY_LEFT.pos, minWidth: CELL_WIDTHS.pos, width: CELL_WIDTHS.pos }}
              >
                Pos
              </th>
              <th
                rowSpan={2}
                className="sticky top-0 z-30 border-b border-r border-brand-cream/25 bg-brand-dark px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-brand-creamDark"
                style={{ left: STICKY_LEFT.ros, minWidth: CELL_WIDTHS.ros, width: CELL_WIDTHS.ros }}
              >
                Ros%
              </th>

              {gameweekList.map((gw) => (
                <th
                  key={`gw-header-${gw}`}
                  colSpan={3}
                  className="sticky top-0 z-20 border-b border-r border-brand-cream/25 bg-brand-dark px-2 py-2 text-center text-xs font-bold uppercase tracking-wide text-brand-cream"
                >
                  {`GW${gw}`}
                </th>
              ))}
            </tr>
            <tr>
              {gameweekList.map((gw) => (
                <Fragment key={`gw-subheader-${gw}`}>
                  <th
                    key={`gw-${gw}-stat`}
                    className="sticky top-[37px] z-20 border-b border-r border-brand-cream/20 bg-brand-dark px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-brand-creamDark"
                    style={{ minWidth: CELL_WIDTHS.stat, width: CELL_WIDTHS.stat }}
                  >
                    Stat
                  </th>
                  <th
                    key={`gw-${gw}-gp`}
                    className="sticky top-[37px] z-20 border-b border-r border-brand-cream/20 bg-brand-dark px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-brand-creamDark"
                    style={{ minWidth: CELL_WIDTHS.gp, width: CELL_WIDTHS.gp }}
                  >
                    GP
                  </th>
                  <th
                    key={`gw-${gw}-mins`}
                    className="sticky top-[37px] z-20 border-b border-r border-brand-cream/20 bg-brand-dark px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-brand-creamDark"
                    style={{ minWidth: CELL_WIDTHS.mins, width: CELL_WIDTHS.mins }}
                  >
                    Mins
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>

          <tbody>
            {filteredPlayers.map((player, index) => {
              const rowShade = index % 2 === 0 ? "bg-[#13281a]" : "bg-[#112316]";
              const playerRowsByGw = rowsByPlayerByGw.get(player.id);

              return (
                <tr key={player.id} className={rowShade}>
                  <td
                    className="sticky left-0 z-20 border-b border-r border-brand-cream/10 bg-brand-dark px-3 py-2 font-semibold text-brand-cream"
                    style={{ minWidth: CELL_WIDTHS.player, width: CELL_WIDTHS.player }}
                  >
                    <Link href={`/portal/players/${player.id}`} className="hover:text-brand-greenLight">
                      {player.name}
                    </Link>
                  </td>
                  <td
                    className="sticky z-20 border-b border-r border-brand-cream/10 bg-brand-dark px-3 py-2 text-brand-cream"
                    style={{ left: STICKY_LEFT.team, minWidth: CELL_WIDTHS.team, width: CELL_WIDTHS.team }}
                  >
                    {player.team}
                  </td>
                  <td
                    className="sticky z-20 border-b border-r border-brand-cream/10 bg-brand-dark px-3 py-2"
                    style={{ left: STICKY_LEFT.pos, minWidth: CELL_WIDTHS.pos, width: CELL_WIDTHS.pos }}
                  >
                    <span className="inline-flex rounded-full border border-brand-cream/30 px-2 py-0.5 text-xs font-semibold text-brand-cream">
                      {player.position === "DEF" ? "D" : player.position === "MID" ? "M" : player.position === "FWD" ? "F" : "G"}
                    </span>
                  </td>
                  <td
                    className="sticky z-20 border-b border-r border-brand-cream/10 bg-brand-dark px-3 py-2 text-brand-cream"
                    style={{ left: STICKY_LEFT.ros, minWidth: CELL_WIDTHS.ros, width: CELL_WIDTHS.ros }}
                  >
                    {player.ownershipPct.toFixed(1)}%
                  </td>

                  {gameweekList.map((gw) => {
                    const row = playerRowsByGw?.get(gw);
                    const noRow = !row;
                    const applicable = isStatApplicable(player.position, selectedStat);

                    let statCellContent = "-";
                    let statCellClass = "border-b border-r border-brand-cream/10 bg-[#1f2a22] text-brand-creamDark";
                    let statCellStyle: CSSProperties | undefined;

                    if (!noRow && applicable) {
                      const value = Number(row[selectedStat] ?? 0);
                      statCellContent = toDisplayValue(value);

                      if (selectedStat === "raw_fantrax_pts") {
                        statCellStyle = { backgroundColor: pointsGradientBackground(value) };
                        statCellClass = "border-b border-r border-brand-cream/10 text-[#0f1f13]";
                      } else {
                        statCellClass = "border-b border-r border-brand-cream/10 bg-[#E8E4D9] text-[#0f1f13]";
                      }
                    }

                    const gpCellContent = noRow ? "-" : gpStatus(row);
                    const gpCellClass = noRow
                      ? "border-b border-r border-brand-cream/10 bg-[#1f2a22] text-brand-creamDark"
                      : `border-b border-r border-brand-cream/10 ${gpStatusClasses(gpStatus(row))}`;

                    const minsCellContent = noRow ? "-" : String(row.minutes_played ?? 0);
                    const minsCellClass = noRow
                      ? "border-b border-r border-brand-cream/10 bg-[#1f2a22] text-brand-creamDark"
                      : "border-b border-r border-brand-cream/10 bg-[#E8E4D9] text-[#0f1f13]";

                    return (
                      <Fragment key={`${player.id}-${gw}`}>
                        <td className={`${statCellClass} px-2 py-2 text-center text-xs`} style={statCellStyle}>
                          {statCellContent}
                        </td>
                        <td className={`${gpCellClass} px-2 py-2 text-center text-xs font-semibold`}>
                          {gpCellContent}
                        </td>
                        <td className={`${minsCellClass} px-2 py-2 text-center text-xs`}>
                          {minsCellContent}
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
    </div>
  );
}
