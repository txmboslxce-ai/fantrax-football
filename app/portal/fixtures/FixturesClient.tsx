"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type FixtureCard = {
  id: string;
  gameweek: number;
  homeAbbrev: string;
  awayAbbrev: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string | null;
};

type FixturesClientProps = {
  fixtures: FixtureCard[];
  defaultGameweek: number;
};

function formatKickoff(value: string | null): string {
  if (!value) {
    return "Kickoff TBD";
  }

  const kickoff = new Date(value);
  if (Number.isNaN(kickoff.getTime())) {
    return "Kickoff TBD";
  }

  return new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(kickoff);
}

function compareFixtures(a: FixtureCard, b: FixtureCard): number {
  if (a.kickoffAt && b.kickoffAt) {
    const kickoffDelta = new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime();
    if (kickoffDelta !== 0) {
      return kickoffDelta;
    }
  } else if (a.kickoffAt) {
    return -1;
  } else if (b.kickoffAt) {
    return 1;
  }

  const homeDelta = a.homeTeam.localeCompare(b.homeTeam);
  if (homeDelta !== 0) {
    return homeDelta;
  }

  return a.awayTeam.localeCompare(b.awayTeam);
}

export default function FixturesClient({ fixtures, defaultGameweek }: FixturesClientProps) {
  const [selectedGameweek, setSelectedGameweek] = useState(defaultGameweek);

  const gameweeks = useMemo(
    () => Array.from(new Set(fixtures.map((fixture) => fixture.gameweek))).sort((a, b) => a - b),
    [fixtures]
  );

  const visibleFixtures = useMemo(
    () => fixtures.filter((fixture) => fixture.gameweek === selectedGameweek).sort(compareFixtures),
    [fixtures, selectedGameweek]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <label htmlFor="gameweek" className="text-sm font-semibold text-slate-600">
          Gameweek
        </label>
        <select
          id="gameweek"
          value={selectedGameweek}
          onChange={(event) => setSelectedGameweek(Number(event.target.value))}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-brand-dark focus:border-brand-green focus:outline-none"
        >
          {gameweeks.map((gameweek) => (
            <option key={gameweek} value={gameweek}>
              GW {gameweek}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {visibleFixtures.map((fixture) => (
          <Link
            key={fixture.id}
            href={`/portal/fixtures/${fixture.id}?gameweek=${selectedGameweek}`}
            prefetch={false}
            className="block rounded-xl border border-slate-200 bg-white p-4 text-brand-dark shadow-sm transition-colors hover:border-brand-green hover:bg-brand-green/10"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">GW {fixture.gameweek}</p>
                <p className="mt-1 text-sm text-slate-500">{formatKickoff(fixture.kickoffAt)}</p>
              </div>
              <div className="grid flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
                <div className="text-right">
                  <p className="text-base font-black text-brand-dark sm:text-sm sm:font-normal sm:text-slate-500">
                    {fixture.homeAbbrev}
                  </p>
                  <p className="hidden text-lg font-black text-brand-dark sm:block">{fixture.homeTeam}</p>
                </div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-brand-green">vs</p>
                <div>
                  <p className="text-base font-black text-brand-dark sm:text-sm sm:font-normal sm:text-slate-500">
                    {fixture.awayAbbrev}
                  </p>
                  <p className="hidden text-lg font-black text-brand-dark sm:block">{fixture.awayTeam}</p>
                </div>
              </div>
              <div className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Open
              </div>
            </div>
          </Link>
        ))}

        {visibleFixtures.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            No fixtures found for the selected gameweek.
          </div>
        ) : null}
      </div>
    </div>
  );
}
