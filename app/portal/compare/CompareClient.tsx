"use client";

import { useMemo, useState } from "react";
import AvailabilityIcon from "@/app/components/ui/AvailabilityIcon";
import RosterPill from "@/app/components/ui/RosterPill";
import { computeRadarValue } from "@/lib/portal/radarScaling";
import type { LeagueRosterData } from "@/lib/portal/leagueRoster";
import { Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";

type ComparePlayerSnapshot = {
  id: string;
  name: string;
  team: string;
  teamName: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  chanceOfPlaying: number | null;
  availabilityStatus: string | null;
  availabilityNews: string | null;
  avgPtsPerGame: number;
  avgPtsPerStart: number;
  ghostPtsPerStart: number;
  nextOpponent: string;
  homePct: number;
  awayPct: number;
  comparison: {
    seasonPts: number;
    avgGw: number;
    avgStart: number;
    ghostGw: number;
    ghostStart: number;
    goals: number;
    assists: number;
    cleanSheets: number;
    homeAvg: number;
    awayAvg: number;
  };
};

type CompareClientProps = {
  players: ComparePlayerSnapshot[];
  leagueRoster: LeagueRosterData | null;
};

type CompareSlot = {
  id: string;
  label: string;
};

const rows: Array<{ label: string; key: keyof ComparePlayerSnapshot["comparison"] }> = [
  { label: "Season Pts", key: "seasonPts" },
  { label: "Avg/GW", key: "avgGw" },
  { label: "Avg/Start", key: "avgStart" },
  { label: "Ghost Pts/GW", key: "ghostGw" },
  { label: "Ghost/Start", key: "ghostStart" },
  { label: "Goals", key: "goals" },
  { label: "Assists", key: "assists" },
  { label: "Clean Sheets", key: "cleanSheets" },
  { label: "Home Avg", key: "homeAvg" },
  { label: "Away Avg", key: "awayAvg" },
];

const radarStats: Array<{ label: string; key: keyof ComparePlayerSnapshot["comparison"] }> = [
  { label: "Season Pts", key: "seasonPts" },
  { label: "Avg/Start", key: "avgStart" },
  { label: "Ghost/Start", key: "ghostStart" },
  { label: "Goals", key: "goals" },
  { label: "Assists", key: "assists" },
  { label: "Clean Sheets", key: "cleanSheets" },
];

const radarColors = ["#005B3A", "#1D4ED8", "#DC2626", "#7E22CE"];

function playerLabel(player: ComparePlayerSnapshot): string {
  return `${player.name} (${player.team})`;
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

export default function CompareClient({ players, leagueRoster }: CompareClientProps) {
  const initialSelections: CompareSlot[] = [
    { id: "", label: "" },
    { id: "", label: "" },
  ];

  const [slots, setSlots] = useState<CompareSlot[]>(initialSelections);

  const selectedPlayers = useMemo(
    () => slots.map((slot) => players.find((player) => player.id === slot.id) ?? null).filter((player): player is ComparePlayerSnapshot => player != null),
    [players, slots]
  );

  const radarRanksByPlayerId = useMemo(() => {
    const ranksByPlayerId = new Map<string, Partial<Record<keyof ComparePlayerSnapshot["comparison"], number>>>();
    const outfieldPlayers = players.filter((player) => player.position !== "GK");

    for (const player of outfieldPlayers) {
      ranksByPlayerId.set(player.id, {});
    }

    for (const { key } of radarStats) {
      let rank = 0;
      let previousValue: number | undefined;

      [...outfieldPlayers]
        .sort((a, b) => b.comparison[key] - a.comparison[key])
        .forEach((player, index) => {
          const value = player.comparison[key];
          if (index === 0 || value !== previousValue) {
            rank = index + 1;
            previousValue = value;
          }
          ranksByPlayerId.get(player.id)![key] = rank;
        });
    }

    return ranksByPlayerId;
  }, [players]);

  const radarPlayers = useMemo(
    () => selectedPlayers.filter((player) => player.position !== "GK"),
    [selectedPlayers]
  );

  const radarData = useMemo(
    () => {
      if (radarPlayers.length < 2) {
        return [];
      }

      return radarStats.map(({ label, key }) => {
        const dataPoint: Record<string, string | number> = { stat: label };

        radarPlayers.forEach((player) => {
          const rank = radarRanksByPlayerId.get(player.id)?.[key] ?? 301;
          dataPoint[player.name] = computeRadarValue(rank, players.length, 300);
        });

        return dataPoint;
      });
    },
    [players, radarPlayers, radarRanksByPlayerId]
  );

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

      {selectedPlayers.length >= 2 && (
        <>
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            {selectedPlayers.map((player) => (
              <article key={player.id} className="rounded-xl border border-slate-200 bg-white p-5 text-brand-dark">
                <h2 className="inline-flex items-center gap-1 text-xl font-black">
                  <span>{player.name}</span>
                  <AvailabilityIcon
                    chanceOfPlaying={player.chanceOfPlaying}
                    status={player.availabilityStatus}
                    news={player.availabilityNews}
                  />
                  <RosterPill playerId={player.id} leagueRoster={leagueRoster} />
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {player.teamName} • {player.position}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <p>Avg Pts/G: {player.avgPtsPerGame.toFixed(2)}</p>
                  <p>Avg Pts/Start: {player.avgPtsPerStart.toFixed(2)}</p>
                  <p>Ghost/Start: {player.ghostPtsPerStart.toFixed(2)}</p>
                  <p>Next: {player.nextOpponent}</p>
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  {player.homePct.toFixed(1)}% home / {player.awayPct.toFixed(1)}% away
                </p>
              </article>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5">
            <div>
              <h2 className="text-lg font-black text-brand-dark">Player profile comparison</h2>
              {radarPlayers.length >= 2 ? (
                <p className="mt-1 text-sm text-slate-500">Outfield players ranked 1st to 300th, banded from elite (outer edge) to below-average (center).</p>
              ) : null}
            </div>
            {radarPlayers.length >= 2 ? (
              <div className="h-96 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} outerRadius="68%">
                    <PolarGrid stroke="#CBD5E1" />
                    <PolarAngleAxis dataKey="stat" tick={{ fill: "#475569", fontSize: 12 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={false} />
                    {radarPlayers.map((player, index) => (
                      <Radar
                        key={player.id}
                        name={player.name}
                        dataKey={player.name}
                        stroke={radarColors[index]}
                        fill={radarColors[index]}
                        fillOpacity={0.1}
                        strokeWidth={2}
                      />
                    ))}
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-12 text-sm text-slate-500">Radar comparison isn&apos;t available for goalkeepers yet — select at least 2 outfield players to see this chart.</p>
            )}
          </section>

          <div className="min-w-0 max-w-full overflow-x-auto">
            <div className="w-max rounded-xl border border-slate-200 bg-white">
              <table className="w-max text-left text-sm text-brand-dark">
              <thead className="bg-brand-green text-brand-cream">
                <tr>
                  <th className="w-32 min-w-32 px-4 py-3">Stat</th>
                  {selectedPlayers.map((player) => (
                    <th key={player.id} className="w-40 min-w-40 whitespace-nowrap px-4 py-3">
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        <span>{player.name}</span>
                        <AvailabilityIcon
                          chanceOfPlaying={player.chanceOfPlaying}
                          status={player.availabilityStatus}
                          news={player.availabilityNews}
                        />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const values = selectedPlayers.map((player) => player.comparison[row.key]);
                  const bestValue = Math.max(...values);

                  return (
                    <tr
                      key={row.key}
                      className={index % 2 === 0 ? "bg-white text-brand-dark" : "bg-slate-50 text-brand-dark"}
                    >
                      <td className="w-32 min-w-32 px-4 py-3 font-semibold">{row.label}</td>
                      {values.map((value, valueIndex) => (
                      <td key={`${row.key}-${selectedPlayers[valueIndex].id}`} className={`w-40 min-w-40 px-4 py-3 ${value === bestValue ? "font-bold text-brand-green" : ""}`}>
                          {value.toFixed(2)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
          </div>
        </>
      )}
    </div>
  );
}
