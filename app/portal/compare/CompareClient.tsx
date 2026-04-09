"use client";

import MiniSparkline from "@/components/portal/charts/MiniSparkline";
import { useMemo, useState } from "react";
import AvailabilityIcon from "@/app/components/ui/AvailabilityIcon";

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
  last5: Array<{ gameweek: number; points: number }>;
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

function playerLabel(player: ComparePlayerSnapshot): string {
  return `${player.name} (${player.team})`;
}

function SearchablePlayerPicker({
  label,
  value,
  onChange,
  players,
  onRemove,
}: {
  label: string;
  value: string;
  onChange: (id: string, query: string) => void;
  players: ComparePlayerSnapshot[];
  onRemove?: () => void;
}) {
  const [query, setQuery] = useState(value);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return players.slice(0, 8);
    }
    return players
      .filter((player) => `${player.name} ${player.team}`.toLowerCase().includes(term))
      .slice(0, 8);
  }, [players, query]);

  return (
    <label className="relative space-y-1 text-sm text-brand-creamDark">
      <span className="flex items-center justify-between gap-2">
        <span>{label}</span>
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs font-semibold text-brand-creamDark transition-colors hover:text-brand-cream"
          >
            Remove
          </button>
        ) : null}
      </span>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search player"
        className="w-full rounded-md border border-brand-cream/35 bg-brand-dark px-3 py-2 text-brand-cream"
      />
      <div className="absolute z-20 mt-1 w-full rounded-md border border-brand-cream/25 bg-brand-dark shadow-lg">
        {filtered.map((player) => (
          <button
            key={player.id}
            type="button"
            onClick={() => {
              const labelValue = playerLabel(player);
              setQuery(labelValue);
              onChange(player.id, labelValue);
            }}
            className="block w-full px-3 py-2 text-left text-sm text-brand-cream hover:bg-brand-greenDark"
          >
            {playerLabel(player)}
          </button>
        ))}
      </div>
    </label>
  );
}

export default function CompareClient({ players }: CompareClientProps) {
  const initialSelections: CompareSlot[] = [
    { id: "", label: "" },
    { id: "", label: "" },
  ];

  const [slots, setSlots] = useState<CompareSlot[]>(initialSelections);

  const selectedPlayers = useMemo(
    () => slots.map((slot) => players.find((player) => player.id === slot.id) ?? null).filter((player): player is ComparePlayerSnapshot => player != null),
    [players, slots]
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
              onRemove={index >= 2 ? () => removeSlot(index) : undefined}
            />
          ))}
        </div>
        {slots.length < 4 ? (
          <button
            type="button"
            onClick={addSlot}
            className="rounded-full border border-brand-cream/35 bg-brand-dark px-4 py-2 text-sm font-semibold text-brand-cream transition-colors hover:bg-brand-greenDark"
          >
            Add player
          </button>
        ) : null}
      </div>

      {selectedPlayers.length >= 2 && (
        <>
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            {selectedPlayers.map((player) => (
              <article key={player.id} className="rounded-xl border border-brand-cream/20 bg-brand-dark/70 p-5 text-brand-cream">
                <h2 className="inline-flex items-center gap-1 text-xl font-black">
                  <span>{player.name}</span>
                  <AvailabilityIcon
                    chanceOfPlaying={player.chanceOfPlaying}
                    status={player.availabilityStatus}
                    news={player.availabilityNews}
                  />
                </h2>
                <p className="mt-1 text-sm text-brand-creamDark">
                  {player.teamName} • {player.position}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <p>Avg Pts/G: {player.avgPtsPerGame.toFixed(2)}</p>
                  <p>Avg Pts/Start: {player.avgPtsPerStart.toFixed(2)}</p>
                  <p>Ghost/Start: {player.ghostPtsPerStart.toFixed(2)}</p>
                  <p>Next: {player.nextOpponent}</p>
                </div>
                <p className="mt-3 text-sm text-brand-creamDark">
                  {player.homePct.toFixed(1)}% home / {player.awayPct.toFixed(1)}% away
                </p>
                <div className="mt-2">
                  <MiniSparkline data={player.last5} />
                </div>
              </article>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-brand-cream/20">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-brand-dark text-brand-creamDark">
                <tr>
                  <th className="px-4 py-3">Stat</th>
                  {selectedPlayers.map((player) => (
                    <th key={player.id} className="px-4 py-3">
                      <span className="inline-flex items-center gap-1">
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
                      className={index % 2 === 0 ? "bg-brand-dark/70 text-brand-cream" : "bg-brand-dark text-brand-cream"}
                    >
                      <td className="px-4 py-3 font-semibold">{row.label}</td>
                      {values.map((value, valueIndex) => (
                        <td key={`${row.key}-${selectedPlayers[valueIndex].id}`} className={`px-4 py-3 ${value === bestValue ? "font-bold text-brand-greenLight" : ""}`}>
                          {value.toFixed(2)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
