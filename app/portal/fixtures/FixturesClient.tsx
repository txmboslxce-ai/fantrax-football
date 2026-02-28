"use client";

import { useMemo, useState } from "react";

type FixtureCard = {
  id: string;
  gameweek: number;
  homeTeam: string;
  awayTeam: string;
};

type FixturesClientProps = {
  fixtures: FixtureCard[];
  defaultGameweek: number;
};

export default function FixturesClient({ fixtures, defaultGameweek }: FixturesClientProps) {
  const [selectedGameweek, setSelectedGameweek] = useState(defaultGameweek);

  const gameweeks = useMemo(
    () => Array.from(new Set(fixtures.map((fixture) => fixture.gameweek))).sort((a, b) => a - b),
    [fixtures]
  );

  const visibleFixtures = useMemo(
    () => fixtures.filter((fixture) => fixture.gameweek === selectedGameweek),
    [fixtures, selectedGameweek]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <label htmlFor="gameweek" className="text-sm font-semibold text-brand-creamDark">
          Gameweek
        </label>
        <select
          id="gameweek"
          value={selectedGameweek}
          onChange={(event) => setSelectedGameweek(Number(event.target.value))}
          className="rounded-md border border-brand-cream/40 bg-brand-dark px-3 py-2 text-sm text-brand-cream focus:border-brand-green focus:outline-none"
        >
          {gameweeks.map((gameweek) => (
            <option key={gameweek} value={gameweek}>
              GW {gameweek}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {visibleFixtures.map((fixture) => (
          <article
            key={fixture.id}
            className="rounded-xl border border-brand-green/35 bg-brand-dark/80 p-4 text-brand-cream shadow-sm"
          >
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <p className="text-right font-bold text-brand-cream">{fixture.homeTeam}</p>
              <p className="text-xs font-black uppercase tracking-widest text-brand-greenLight">vs</p>
              <p className="font-bold text-brand-cream">{fixture.awayTeam}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
