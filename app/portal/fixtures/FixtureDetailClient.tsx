"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import AvailabilityIcon from "@/app/components/ui/AvailabilityIcon";
import RosterPill from "@/app/components/ui/RosterPill";
import type { LeagueRosterData } from "@/lib/portal/leagueRoster";
import { positionBadgeClass } from "@/lib/portal/positionBadge";

type TopLevelView = "lineups" | "statsTable" | "shotMap" | "analytics";
type StatsSubView = "fantasy" | "stats";

type FixturePlayerRow = {
  id: string;
  name: string;
  team: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  gamesStarted: number;
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
  formation?: ReactNode;
};

// The header card and the Lineups tab (which contains the pitch graphic)
// share this width rather than stretching full-bleed; Stats Table keeps the
// full width below it since those tables benefit from the extra room.
const HEADER_WIDTH_CLASS = "max-w-[850px]";

const TOP_LEVEL_TABS: Array<{ key: TopLevelView; label: string }> = [
  { key: "lineups", label: "Lineups" },
  { key: "statsTable", label: "Stats Table" },
  { key: "shotMap", label: "Shot Map" },
  { key: "analytics", label: "Analytics" },
];

const statsSubViewLabels: Record<StatsSubView, string> = {
  fantasy: "Fantasy",
  stats: "Stats",
};

function formatNumber(value: number): string {
  return value.toFixed(2);
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
        active ? "border-brand-green bg-brand-green text-brand-cream" : "border-slate-300 bg-white text-brand-dark hover:bg-brand-green/10"
      }`}
    >
      {children}
    </button>
  );
}

function PlaceholderPanel({ text }: { text: string }) {
  return (
    <div className={`rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500 ${HEADER_WIDTH_CLASS}`}>
      {text}
    </div>
  );
}

function SectionDivider({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="border-b border-slate-200 bg-slate-50 px-2 py-1 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500"
      >
        {label}
      </td>
    </tr>
  );
}

function PlayerTableRow({ row, index, activeView, leagueRoster }: { row: FixturePlayerRow; index: number; activeView: StatsSubView; leagueRoster: LeagueRosterData | null }) {
  const rowShade = index % 2 === 0 ? "bg-white" : "bg-slate-50";

  return (
    <tr className={`group ${rowShade} text-brand-dark transition-colors hover:bg-brand-green/10`}>
      <td className={`sticky left-0 z-20 w-40 min-w-40 border-b border-r border-slate-200 px-2 py-1.5 font-semibold ${rowShade} group-hover:bg-brand-green/10`}>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <Link href={`/portal/players/${row.id}`} prefetch={false} className="hover:text-brand-green hover:underline">
            {row.name}
          </Link>
          <AvailabilityIcon
            chanceOfPlaying={row.chanceOfPlaying}
            status={row.availabilityStatus}
            news={row.availabilityNews}
          />
          <RosterPill playerId={row.id} leagueRoster={leagueRoster} variant="inline" />
        </span>
      </td>
      <td className={`w-12 min-w-12 border-b border-r border-slate-200 px-2 py-1.5 text-center ${rowShade} group-hover:bg-brand-green/10`}>
        <span className={`inline-flex min-w-5 h-5 items-center justify-center rounded-full px-1 text-[10px] font-bold ${positionBadgeClass(row.position)}`}>{row.position}</span>
      </td>
      <td className="w-16 min-w-16 border-b border-r border-slate-200 px-2 py-1.5 text-center font-semibold tabular-nums">{row.minutesPlayed}</td>
      {activeView === "fantasy" ? (
        <>
          <td className="w-20 min-w-20 border-b border-r border-slate-200 px-2 py-1.5 text-center font-semibold tabular-nums">
            {formatNumber(row.rawFantraxPts)}
          </td>
          <td className="w-20 min-w-20 border-b border-slate-200 px-2 py-1.5 text-center font-semibold tabular-nums">{formatNumber(row.ghostPts)}</td>
        </>
      ) : (
        <>
          <td className="w-16 min-w-16 border-b border-r border-slate-200 px-2 py-1.5 text-center font-semibold tabular-nums">{row.goals}</td>
          <td className="w-16 min-w-16 border-b border-r border-slate-200 px-2 py-1.5 text-center font-semibold tabular-nums">{row.assists}</td>
          <td className="w-16 min-w-16 border-b border-r border-slate-200 px-2 py-1.5 text-center font-semibold tabular-nums">{row.keyPasses}</td>
          <td className="w-16 min-w-16 border-b border-r border-slate-200 px-2 py-1.5 text-center font-semibold tabular-nums">{row.cornerKicks}</td>
          <td className="w-16 min-w-16 border-b border-slate-200 px-2 py-1.5 text-center font-semibold tabular-nums">{row.freeKickShots}</td>
        </>
      )}
    </tr>
  );
}

function TeamTable({
  title,
  rows,
  activeView,
  leagueRoster,
}: {
  title: string;
  rows: FixturePlayerRow[];
  activeView: StatsSubView;
  leagueRoster: LeagueRosterData | null;
}) {
  const starters = rows.filter((r) => r.gamesStarted === 1);
  const substitutes = rows.filter((r) => r.gamesStarted !== 1);
  const colSpan = activeView === "fantasy" ? 5 : 8;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-xl font-black text-brand-dark">{title}</h2>
        <p className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">{rows.length} players logged minutes</p>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-slate-500">No player gameweek data available for this side yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-left text-xs text-brand-dark">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 w-40 min-w-40 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-brand-cream">Player</th>
                <th className="sticky top-0 z-20 w-12 min-w-12 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-brand-cream">Pos</th>
                <th className="sticky top-0 z-20 w-16 min-w-16 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-brand-cream">Min</th>
                {activeView === "fantasy" ? (
                  <>
                    <th className="sticky top-0 z-20 w-20 min-w-20 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                      Score
                    </th>
                    <th className="sticky top-0 z-20 w-20 min-w-20 border-b border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-brand-cream">
                      Ghost
                    </th>
                  </>
                ) : (
                  <>
                    <th className="sticky top-0 z-20 w-16 min-w-16 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-brand-cream">G</th>
                    <th className="sticky top-0 z-20 w-16 min-w-16 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-brand-cream">A</th>
                    <th className="sticky top-0 z-20 w-16 min-w-16 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-brand-cream">KP</th>
                    <th className="sticky top-0 z-20 w-16 min-w-16 border-b border-r border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-brand-cream">CK</th>
                    <th className="sticky top-0 z-20 w-16 min-w-16 border-b border-brand-cream/25 bg-brand-green px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-brand-cream">FKS</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {starters.map((row, index) => (
                <PlayerTableRow key={row.id} row={row} index={index} activeView={activeView} leagueRoster={leagueRoster} />
              ))}
              {substitutes.length > 0 ? (
                <>
                  <SectionDivider label="Substitutes" colSpan={colSpan} />
                  {substitutes.map((row, index) => (
                    <PlayerTableRow key={row.id} row={row} index={starters.length + 1 + index} activeView={activeView} leagueRoster={leagueRoster} />
                  ))}
                </>
              ) : null}
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
  formation,
}: FixtureDetailClientProps) {
  const [activeTab, setActiveTab] = useState<TopLevelView>("lineups");
  const [statsView, setStatsView] = useState<StatsSubView>("fantasy");

  return (
    <div className="space-y-6">
      <div className={`rounded-xl border border-slate-200 bg-white px-4 py-4 ${HEADER_WIDTH_CLASS}`}>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">GW {gameweek}</p>
        <h1 className="mt-2 text-3xl font-black text-brand-dark sm:text-4xl">
          {homeTeam} vs {awayTeam}
        </h1>
        <p className="mt-2 text-sm text-slate-500">{kickoffLabel ?? "Kickoff TBD"}</p>
      </div>

      <nav className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ flexWrap: "nowrap" }}>
        {TOP_LEVEL_TABS.map((tab) => (
          <TabButton key={tab.key} active={activeTab === tab.key} onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </TabButton>
        ))}
      </nav>

      {activeTab === "lineups" ? formation ?? <PlaceholderPanel text="Lineups aren't confirmed yet -- check back closer to kickoff." /> : null}

      {activeTab === "statsTable" ? (
        <div className="space-y-4">
          <nav className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ flexWrap: "nowrap" }}>
            {(["fantasy", "stats"] as const).map((view) => (
              <TabButton key={view} active={statsView === view} onClick={() => setStatsView(view)}>
                {statsSubViewLabels[view]}
              </TabButton>
            ))}
          </nav>

          <div className="grid gap-4 lg:grid-cols-2">
            <TeamTable title={homeTeam} rows={homePlayers} activeView={statsView} leagueRoster={leagueRoster} />
            <TeamTable title={awayTeam} rows={awayPlayers} activeView={statsView} leagueRoster={leagueRoster} />
          </div>
        </div>
      ) : null}

      {activeTab === "shotMap" ? <PlaceholderPanel text="Shot map coming soon." /> : null}
      {activeTab === "analytics" ? <PlaceholderPanel text="Analytics coming soon." /> : null}
    </div>
  );
}
