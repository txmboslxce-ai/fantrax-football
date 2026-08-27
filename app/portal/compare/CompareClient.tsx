"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import RosterPill from "@/app/components/ui/RosterPill";
import PercentileRadarChart, { type RadarPlayerSeries, type RadarStatPoint } from "@/components/portal/charts/PercentileRadarChart";
import PercentileStatsTable, { type StatTableRow } from "@/components/portal/charts/PercentileStatsTable";
import { digitsForRadarStat, type RadarDatum, type RadarProfileKey } from "@/lib/portal/radarTypes";
import type { LeagueRosterData } from "@/lib/portal/leagueRoster";
import type { ComparePlayerSnapshot } from "@/app/portal/compare/page";

type CompareClientProps = {
  players: ComparePlayerSnapshot[];
  leagueRoster: LeagueRosterData | null;
  season: string;
  availableSeasons: string[];
};

type CompareSlot = {
  id: string;
  label: string;
};

const PLAYER_COLORS = ["#005B3A", "#1D4ED8", "#DC2626", "#7E22CE"];

function playerLabel(player: ComparePlayerSnapshot): string {
  return `${player.name} (${player.team})`;
}

// Different positions carry different Stats-radar axes (see
// lib/portal/summaryRecompute.ts's STATS_METRICS) — comparing a defender
// against a forward only makes sense on the stats they both actually have,
// so the chart falls back to whichever axes every selected player shares.
function commonStatLabels(datasets: RadarDatum[][]): string[] {
  if (datasets.length === 0) return [];
  const [first, ...rest] = datasets;
  return first.map((point) => point.stat).filter((stat) => rest.every((data) => data.some((point) => point.stat === stat)));
}

function alignToStats(data: RadarDatum[], stats: string[]): RadarStatPoint[] {
  return stats.map((stat) => {
    const point = data.find((entry) => entry.stat === stat);
    return {
      stat,
      shortLabel: point?.shortLabel,
      rawValue: point?.rawValue ?? 0,
      percentile: point?.percentile ?? 0,
      value: point?.value ?? 0,
    };
  });
}

function buildSeries(
  profile: RadarProfileKey,
  playersSubset: ComparePlayerSnapshot[],
  colorByPlayerId: Map<string, string>
): RadarPlayerSeries[] {
  const datasets = playersSubset.map((player) => player.radarProfiles[profile] ?? []);
  const statLabels = commonStatLabels(datasets);

  return playersSubset.map((player) => ({
    id: player.id,
    name: player.name,
    color: colorByPlayerId.get(player.id) ?? PLAYER_COLORS[0],
    data: alignToStats(player.radarProfiles[profile] ?? [], statLabels),
  }));
}

const PERCENTILE_NOTES: Record<RadarProfileKey, string> = {
  fantasy: "Percentile against all outfield players (or all goalkeepers, for a keeper) who have played at least one game this season.",
  stats_total: "Percentile against all outfield players who have played at least one game this season.",
  stats_per90: "Percentile against all outfield players who have played at least one game this season.",
  goalkeeper: "Percentile against all goalkeepers who have played at least one game this season.",
};

function buildTableRows(profile: RadarProfileKey, series: RadarPlayerSeries[]): StatTableRow[] {
  if (series.length === 0 || series[0].data.length === 0) return [];

  return series[0].data.map((_, statIndex) => ({
    stat: series[0].data[statIndex].stat,
    digits: digitsForRadarStat(profile, series[0].data[statIndex].stat),
    values: series.map((playerSeries) => ({
      playerId: playerSeries.id,
      rawValue: playerSeries.data[statIndex]?.rawValue ?? 0,
      percentile: playerSeries.data[statIndex]?.percentile ?? 0,
    })),
  }));
}

function SearchablePlayerPicker({
  label,
  value,
  onChange,
  players,
  leagueRoster,
  onRemove,
}: {
  label: string;
  value: string;
  onChange: (id: string, query: string) => void;
  players: ComparePlayerSnapshot[];
  leagueRoster: LeagueRosterData | null;
  onRemove?: () => void;
}) {
  const [query, setQuery] = useState(value);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return [];
    }
    return players
      .filter((player) => `${player.name} ${player.team}`.toLowerCase().includes(term))
      .slice(0, 8);
  }, [players, query]);

  return (
    <label className="relative space-y-1 text-sm text-slate-600">
      <span className="flex items-center justify-between gap-2">
        <span>{label}</span>
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs font-semibold text-slate-500 transition-colors hover:text-brand-dark"
          >
            Remove
          </button>
        ) : null}
      </span>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search player"
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-brand-dark placeholder:text-slate-400 focus:border-brand-green focus:outline-none"
      />
      {filtered.length > 0 ? (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg">
          {filtered.map((player) => (
            <button
              key={player.id}
              type="button"
              onClick={() => {
                const labelValue = playerLabel(player);
                setQuery(labelValue);
                onChange(player.id, labelValue);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-brand-dark hover:bg-brand-green/10"
            >
              <span className="flex items-center gap-1">
                <span>{playerLabel(player)}</span>
                <RosterPill playerId={player.id} leagueRoster={leagueRoster} />
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </label>
  );
}

export default function CompareClient({ players, leagueRoster, season, availableSeasons }: CompareClientProps) {
  const router = useRouter();
  const pathname = usePathname();

  const initialSelections: CompareSlot[] = [
    { id: "", label: "" },
    { id: "", label: "" },
  ];

  const [slots, setSlots] = useState<CompareSlot[]>(initialSelections);

  const selectedPlayers = useMemo(
    () => slots.map((slot) => players.find((player) => player.id === slot.id) ?? null).filter((player): player is ComparePlayerSnapshot => player != null),
    [players, slots]
  );

  // A selected player can drop out of the pool for a different season (e.g.
  // they weren't in the league yet) - slot.label keeps their name around so
  // we can still say who's missing, rather than the comparison just silently
  // showing one fewer player with no explanation.
  const missingPlayers = slots.filter((slot) => slot.id && !players.some((player) => player.id === slot.id));

  function selectSeason(nextSeason: string) {
    const params = new URLSearchParams(window.location.search);
    params.set("season", nextSeason);
    router.push(`${pathname}?${params.toString()}`);
  }

  const colorByPlayerId = useMemo(
    () => new Map(selectedPlayers.map((player, index) => [player.id, PLAYER_COLORS[index % PLAYER_COLORS.length]])),
    [selectedPlayers]
  );

  const outfieldSelected = selectedPlayers.filter((player) => player.position !== "GK");
  const goalkeepersSelected = selectedPlayers.filter((player) => player.position === "GK");
  const showStatsRadar = selectedPlayers.length >= 2 && goalkeepersSelected.length === 0;
  const showGoalkeeperRadar = selectedPlayers.length >= 2 && outfieldSelected.length === 0;
  const mixedGkAndOutfield = selectedPlayers.length >= 2 && outfieldSelected.length > 0 && goalkeepersSelected.length > 0;

  const fantasySeries = useMemo(
    () => (selectedPlayers.length >= 2 ? buildSeries("fantasy", selectedPlayers, colorByPlayerId) : []),
    [selectedPlayers, colorByPlayerId]
  );
  const statsTotalSeries = useMemo(
    () => (showStatsRadar ? buildSeries("stats_total", outfieldSelected, colorByPlayerId) : []),
    [showStatsRadar, outfieldSelected, colorByPlayerId]
  );
  const statsPer90Series = useMemo(
    () => (showStatsRadar ? buildSeries("stats_per90", outfieldSelected, colorByPlayerId) : []),
    [showStatsRadar, outfieldSelected, colorByPlayerId]
  );
  const goalkeeperSeries = useMemo(
    () => (showGoalkeeperRadar ? buildSeries("goalkeeper", goalkeepersSelected, colorByPlayerId) : []),
    [showGoalkeeperRadar, goalkeepersSelected, colorByPlayerId]
  );

  const tablePlayers = (series: RadarPlayerSeries[]) =>
    series.map((entry) => ({ id: entry.id, name: entry.name, color: entry.color }));

  function updateSlot(index: number, nextSlot: CompareSlot) {
    setSlots((current) => current.map((slot, slotIndex) => (slotIndex === index ? nextSlot : slot)));
  }

  function addSlot() {
    setSlots((current) => {
      if (current.length >= 4) {
        return current;
      }
      return [...current, { id: "", label: "" }];
    });
  }

  function removeSlot(index: number) {
    setSlots((current) => {
      if (current.length <= 2) {
        return current;
      }
      return current.filter((_, slotIndex) => slotIndex !== index);
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {slots.map((slot, index) => (
            <SearchablePlayerPicker
              key={`${index}-${slot.id || "empty"}`}
              label={`Player ${index + 1}`}
              value={slot.label}
              onChange={(id, query) => updateSlot(index, { id, label: query })}
              players={players}
              leagueRoster={leagueRoster}
              onRemove={index >= 2 ? () => removeSlot(index) : undefined}
            />
          ))}
        </div>
        {slots.length < 4 ? (
          <button
            type="button"
            onClick={addSlot}
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-brand-dark transition-colors hover:bg-slate-50"
          >
            Add player
          </button>
        ) : null}
      </div>

      {availableSeasons.length > 1 ? (
        <div className="flex items-center gap-2">
          <label htmlFor="compare-season" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Season
          </label>
          <select
            id="compare-season"
            value={season}
            onChange={(event) => selectSeason(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-brand-dark focus:border-brand-green focus:outline-none"
          >
            {availableSeasons.map((availableSeason) => (
              <option key={availableSeason} value={availableSeason}>
                {availableSeason}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {missingPlayers.length > 0 ? (
        <p className="text-sm text-slate-500">
          {missingPlayers.map((slot) => slot.label).join(" and ")} {missingPlayers.length === 1 ? "wasn't" : "weren't"} in the player pool for{" "}
          {season}.
        </p>
      ) : null}

      {selectedPlayers.length >= 2 && (
        <div className="space-y-4">
          {/* Columns per row is driven by actual available width (auto-fit),
              not a viewport breakpoint - the fixed sidebar eats real estate
              that a breakpoint can't see, which was letting 3 columns claim
              space they didn't have and forcing each stat table into its own
              horizontal scrollbar. minmax's floor is the stat table's own
              min-width, so a column never gets narrower than a table needs. */}
          <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(29rem,1fr))]">
            <div className="flex flex-col gap-2">
              <PercentileRadarChart
                title="Fantasy Profile"
                caption="Ranked against the same guard-railed pool used on each player's own page."
                players={fantasySeries}
              />
              <PercentileStatsTable players={tablePlayers(fantasySeries)} rows={buildTableRows("fantasy", fantasySeries)} percentileNote={PERCENTILE_NOTES.fantasy} />
            </div>

            {showStatsRadar ? (
              <>
                <div className="flex flex-col gap-2">
                  <PercentileRadarChart
                    title="Stats Profile (Season Total)"
                    caption="Only axes every selected player shares are shown."
                    players={statsTotalSeries}
                  />
                  <PercentileStatsTable players={tablePlayers(statsTotalSeries)} rows={buildTableRows("stats_total", statsTotalSeries)} percentileNote={PERCENTILE_NOTES.stats_total} />
                </div>
                <div className="flex flex-col gap-2">
                  <PercentileRadarChart
                    title="Stats Profile (Per 90)"
                    caption="Same stats, adjusted for minutes played."
                    players={statsPer90Series}
                  />
                  <PercentileStatsTable players={tablePlayers(statsPer90Series)} rows={buildTableRows("stats_per90", statsPer90Series)} percentileNote={PERCENTILE_NOTES.stats_per90} />
                </div>
              </>
            ) : null}

            {showGoalkeeperRadar ? (
              <div className="flex flex-col gap-2">
                <PercentileRadarChart title="Goalkeeping Profile" caption="Ranked against goalkeepers who've played at least one game this season." players={goalkeeperSeries} />
                <PercentileStatsTable players={tablePlayers(goalkeeperSeries)} rows={buildTableRows("goalkeeper", goalkeeperSeries)} percentileNote={PERCENTILE_NOTES.goalkeeper} />
              </div>
            ) : null}
          </div>

          {mixedGkAndOutfield ? (
            <p className="text-sm text-slate-500">
              Goalkeepers and outfield players don&apos;t share a stats profile, so only the Fantasy chart above compares this mix. Select
              all goalkeepers or all outfield players to see a Stats or Goalkeeping profile too.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
