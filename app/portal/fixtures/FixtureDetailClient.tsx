"use client";

import Link from "next/link";
import { useState } from "react";
import AvailabilityIcon from "@/app/components/ui/AvailabilityIcon";
import RosterPill from "@/app/components/ui/RosterPill";
import type { LeagueRosterData } from "@/lib/portal/leagueRoster";

type FixtureDetailView = "fantasy" | "stats";

type FixturePlayerRow = {
  id: string;
  name: string;
  team: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  minutesPlayed: number;
  rawFantraxPts: number;
  ghostPts: number;
  goals: number;
  assists: number;
  keyPasses: number;
  accurateCrosses: number;
  cornerKicks: number;
  freeKickShots: number;
  chanceOfPlaying: number | null;
  availabilityStatus: string | null;
  availabilityNews: string | null;
};

type FixtureDetailClientProps = {
  gameweek: number;
  kickoffLabel: string | null;
  homeTeam: string;
  awayTeam: string;
  homePlayers: FixturePlayerRow[];
  awayPlayers: FixturePlayerRow[];
  leagueRoster: LeagueRosterData | null;
};

const viewLabels: Record<FixtureDetailView, string> = {
  fantasy: "Fantasy",
  stats: "Stats",
};

const positionBadgeClass: Record<FixturePlayerRow["position"], string> = {
  GK: "bg-sky-900/60 text-sky-100",
  DEF: "bg-emerald-900/60 text-emerald-100",
  MID: "bg-amber-900/60 text-amber-100",
  FWD: "bg-rose-900/60 text-rose-100",
};

function formatNumber(value: number): string {
  return value.toFixed(2);
}

function TeamTable({
  title,
  rows,
  activeView,
  leagueRoster,
}: {
  title: string;
  rows: FixturePlayerRow[];
  activeView: FixtureDetailView;
  leagueRoster: LeagueRosterData | null;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-brand-cream/20 bg-brand-dark/80">
      <div className="border-b border-brand-cream/15 px-4 py-3">
        <h2 className="text-xl font-black text-brand-cream">{title}</h2>
        <p className="mt-1 text-xs uppercase tracking-[0.22em] text-brand-creamDark">{rows.length} players logged minutes</p>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-brand-creamDark">No player gameweek data available for this side yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-left text-sm text-brand-cream">
            <thead>
              <tr className="bg-brand-dark text-brand-creamDark">
                <th className="border-b border-r border-brand-cream/20 px-4 py-3 text-xs font-semibold uppercase tracking-wide">Player</th>
                <th className="border-b border-r border-brand-cream/20 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide">Min</th>
                {activeView === "fantasy" ? (
                  <>
                    <th className="border-b border-r border-brand-cream/20 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide">
                      Score
                    </th>
                    <th className="border-b border-brand-cream/20 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide">
                      Ghost
                    </th>
                  </>
                ) : (
                  <>
                    <th className="border-b border-r border-brand-cream/20 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide">G</th>
                    <th className="border-b border-r border-brand-cream/20 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide">A</th>
                    <th className="border-b border-r border-brand-cream/20 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide">KP</th>
                    <th className="border-b border-r border-brand-cream/20 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide">Crosses</th>
                    <th className="border-b border-r border-brand-cream/20 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide">CK</th>
                    <th className="border-b border-brand-cream/20 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide">FKS</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id} className={index % 2 === 0 ? "bg-brand-dark/60" : "bg-brand-dark/90"}>
                  <td className="border-b border-r border-brand-cream/10 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1 font-semibold leading-tight">
                      <Link href={`/portal/players/${row.id}`} className="hover:text-brand-green hover:underline">
                        {row.name}
                      </Link>
                      <AvailabilityIcon
                        chanceOfPlaying={row.chanceOfPlaying}
                        status={row.availabilityStatus}
                        news={row.availabilityNews}
                      />
                      <RosterPill playerId={row.id} leagueRoster={leagueRoster} />
                    </div>
                    <div className="mt-1">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${positionBadgeClass[row.position]}`}>
                        {row.position}
                      </span>
                    </div>
                  </td>
                  <td className="border-b border-r border-brand-cream/10 px-3 py-3 text-center font-semibold">{row.minutesPlayed}</td>
                  {activeView === "fantasy" ? (
                    <>
                      <td className="border-b border-r border-brand-cream/10 px-3 py-3 text-center font-semibold">
                        {formatNumber(row.rawFantraxPts)}
                      </td>
                      <td className="border-b border-brand-cream/10 px-3 py-3 text-center font-semibold">{formatNumber(row.ghostPts)}</td>
                    </>
                  ) : (
                    <>
                      <td className="border-b border-r border-brand-cream/10 px-3 py-3 text-center font-semibold">{row.goals}</td>
                      <td className="border-b border-r border-brand-cream/10 px-3 py-3 text-center font-semibold">{row.assists}</td>
                      <td className="border-b border-r border-brand-cream/10 px-3 py-3 text-center font-semibold">{row.keyPasses}</td>
                      <td className="border-b border-r border-brand-cream/10 px-3 py-3 text-center font-semibold">{row.accurateCrosses}</td>
                      <td className="border-b border-r border-brand-cream/10 px-3 py-3 text-center font-semibold">{row.cornerKicks}</td>
                      <td className="border-b border-brand-cream/10 px-3 py-3 text-center font-semibold">{row.freeKickShots}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function FixtureDetailClient({
  gameweek,
  kickoffLabel,
  homeTeam,
  awayTeam,
  homePlayers,
  awayPlayers,
  leagueRoster,
}: FixtureDetailClientProps) {
  const [activeView, setActiveView] = useState<FixtureDetailView>("fantasy");

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-brand-cream/20 bg-brand-dark px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-creamDark">GW {gameweek}</p>
        <h1 className="mt-2 text-3xl font-black text-brand-cream sm:text-4xl">
          {homeTeam} vs {awayTeam}
        </h1>
        <p className="mt-2 text-sm text-brand-creamDark">{kickoffLabel ?? "Kickoff TBD"}</p>
      </div>

      <nav className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ flexWrap: "nowrap" }}>
        {(["fantasy", "stats"] as const).map((view) => (
          <button
            key={view}
            type="button"
            onClick={() => setActiveView(view)}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
              activeView === view
                ? "border-brand-greenLight bg-brand-green text-brand-cream"
                : "border-brand-cream/35 bg-brand-dark text-brand-cream hover:bg-brand-greenDark"
            }`}
          >
            {viewLabels[view]}
          </button>
        ))}
      </nav>

      <div className="grid gap-4 lg:grid-cols-2">
        <TeamTable title={homeTeam} rows={homePlayers} activeView={activeView} leagueRoster={leagueRoster} />
        <TeamTable title={awayTeam} rows={awayPlayers} activeView={activeView} leagueRoster={leagueRoster} />
      </div>
    </div>
  );
}
