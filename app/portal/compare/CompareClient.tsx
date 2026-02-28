"use client";

import MiniSparkline from "@/components/portal/charts/MiniSparkline";
import { useMemo, useState } from "react";

type ComparePlayerSnapshot = {
  id: string;
  name: string;
  team: string;
  teamName: string;
  position: "GK" | "DEF" | "MID" | "FWD";
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
}: {
  label: string;
  value: string;
  onChange: (id: string, query: string) => void;
  players: ComparePlayerSnapshot[];
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
      {label}
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
  const initialLeft = players[0];
  const initialRight = players[1] ?? players[0];

  const [leftId, setLeftId] = useState<string>(initialLeft?.id ?? "");
  const [rightId, setRightId] = useState<string>(initialRight?.id ?? "");
  const [leftLabel, setLeftLabel] = useState<string>(initialLeft ? playerLabel(initialLeft) : "");
  const [rightLabel, setRightLabel] = useState<string>(initialRight ? playerLabel(initialRight) : "");

  const selected = useMemo(() => {
    const left = players.find((player) => player.id === leftId) ?? null;
    const right = players.find((player) => player.id === rightId) ?? null;
    return { left, right };
  }, [leftId, players, rightId]);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2">
        <SearchablePlayerPicker
          label="Player 1"
          value={leftLabel}
          onChange={(id, query) => {
            setLeftId(id);
            setLeftLabel(query);
          }}
          players={players}
        />
        <SearchablePlayerPicker
          label="Player 2"
          value={rightLabel}
          onChange={(id, query) => {
            setRightId(id);
            setRightLabel(query);
          }}
          players={players}
        />
      </div>

      {selected.left && selected.right && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {[selected.left, selected.right].map((player) => (
              <article key={player.id} className="rounded-xl border border-brand-cream/20 bg-brand-dark/70 p-5 text-brand-cream">
                <h2 className="text-xl font-black">{player.name}</h2>
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
                  <th className="px-4 py-3">{selected.left.name}</th>
                  <th className="px-4 py-3">{selected.right.name}</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  if (!selected.left || !selected.right) {
                    return null;
                  }

                  return rows.map((row, index) => {
                    const leftValue = selected.left.comparison[row.key];
                    const rightValue = selected.right.comparison[row.key];
                    const leftBetter = leftValue > rightValue;
                    const rightBetter = rightValue > leftValue;

                    return (
                      <tr
                        key={row.key}
                        className={index % 2 === 0 ? "bg-brand-dark/70 text-brand-cream" : "bg-brand-dark text-brand-cream"}
                      >
                        <td className="px-4 py-3 font-semibold">{row.label}</td>
                        <td className={`px-4 py-3 ${leftBetter ? "font-bold text-brand-greenLight" : ""}`}>{leftValue.toFixed(2)}</td>
                        <td className={`px-4 py-3 ${rightBetter ? "font-bold text-brand-greenLight" : ""}`}>{rightValue.toFixed(2)}</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
