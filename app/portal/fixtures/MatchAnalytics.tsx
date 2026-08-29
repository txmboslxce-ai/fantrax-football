"use client";

import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BsdAveragePosition, BsdMomentumPoint, BsdXgPoint } from "@/lib/bsd/eventStats";
import type { ShotPlayerInfo } from "@/app/portal/fixtures/ShotMap";

type MatchAnalyticsProps = {
  homeTeam: string;
  awayTeam: string;
  momentum: BsdMomentumPoint[];
  xgFlow: BsdXgPoint[];
  totalXg: { home: number | null; away: number | null };
  averagePositions: { home: BsdAveragePosition[]; away: BsdAveragePosition[] };
  playerInfoById: Map<number, ShotPlayerInfo>;
};

const HOME_COLOR = "#005B3A";
const AWAY_COLOR = "#334155";

function PlayerLabel({ playerId, fallback, playerInfoById }: { playerId: number; fallback: string; playerInfoById: Map<number, ShotPlayerInfo> }) {
  const info = playerInfoById.get(playerId);
  if (info?.fantraxId) {
    return (
      <Link href={`/portal/players/${info.fantraxId}`} className="hover:underline">
        {fallback}
      </Link>
    );
  }
  return <>{fallback}</>;
}

function MomentumCard({ homeTeam, awayTeam, momentum }: { homeTeam: string; awayTeam: string; momentum: BsdMomentumPoint[] }) {
  if (momentum.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <h3 className="text-sm font-bold text-brand-dark">Match Momentum</h3>
      <p className="mt-0.5 text-xs text-slate-500">
        Minute-by-minute pressure. Bars toward{" "}
        <span style={{ color: HOME_COLOR }} className="font-semibold">
          {homeTeam}
        </span>{" "}
        or{" "}
        <span style={{ color: AWAY_COLOR }} className="font-semibold">
          {awayTeam}
        </span>{" "}
        mean sustained attacking territory.
      </p>
      <div className="mt-2 h-32 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={momentum} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <XAxis dataKey="minute" tick={{ fontSize: 10 }} interval={9} tickFormatter={(m) => `${m}'`} />
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <ReferenceLine y={0} stroke="#cbd5e1" />
            <Tooltip
              formatter={(value: number) => [value, "Pressure"]}
              labelFormatter={(minute) => `${minute}'`}
              contentStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="value">
              {momentum.map((point, index) => (
                <Cell key={index} fill={point.value >= 0 ? HOME_COLOR : AWAY_COLOR} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function XgFlowCard({ homeTeam, awayTeam, xgFlow, totalXg }: { homeTeam: string; awayTeam: string; xgFlow: BsdXgPoint[]; totalXg: { home: number | null; away: number | null } }) {
  if (xgFlow.length === 0) {
    return null;
  }

  const last = xgFlow[xgFlow.length - 1];
  const finalMinute = Math.max(90, last.minute);
  const chartData = [
    { minute: 0, cumHome: 0, cumAway: 0 },
    ...xgFlow,
    ...(last.minute < finalMinute ? [{ minute: finalMinute, cumHome: last.cumHome, cumAway: last.cumAway }] : []),
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <h3 className="text-sm font-bold text-brand-dark">Expected Goals (xG) Flow</h3>
      <p className="mt-0.5 text-xs text-slate-500">
        <span style={{ color: HOME_COLOR }} className="font-semibold">
          {homeTeam} {totalXg.home?.toFixed(2) ?? "-"} xG
        </span>{" "}
        &middot;{" "}
        <span style={{ color: AWAY_COLOR }} className="font-semibold">
          {awayTeam} {totalXg.away?.toFixed(2) ?? "-"} xG
        </span>
      </p>
      <div className="mt-2 h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="minute" tick={{ fontSize: 10 }} tickFormatter={(m) => `${m}'`} />
            <YAxis tick={{ fontSize: 10 }} width={28} />
            <Tooltip labelFormatter={(minute) => `${minute}'`} formatter={(value: number) => value.toFixed(2)} contentStyle={{ fontSize: 12 }} />
            <Line type="stepAfter" dataKey="cumHome" name={homeTeam} stroke={HOME_COLOR} strokeWidth={2} dot={false} />
            <Line type="stepAfter" dataKey="cumAway" name={awayTeam} stroke={AWAY_COLOR} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AveragePositionsCard({
  homeTeam,
  awayTeam,
  averagePositions,
  playerInfoById,
}: {
  homeTeam: string;
  awayTeam: string;
  averagePositions: { home: BsdAveragePosition[]; away: BsdAveragePosition[] };
  playerInfoById: Map<number, ShotPlayerInfo>;
}) {
  if (averagePositions.home.length === 0 && averagePositions.away.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <h3 className="text-sm font-bold text-brand-dark">Average Positions</h3>
      <div className="mt-1 flex items-center gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: HOME_COLOR }} />
          {homeTeam}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: AWAY_COLOR }} />
          {awayTeam}
        </span>
      </div>

      <div className="relative mx-auto mt-3 aspect-[16/10] w-full max-w-3xl overflow-hidden rounded-lg border border-emerald-900 bg-gradient-to-b from-emerald-700 to-emerald-800">
        <div className="absolute inset-[3%] border border-white/40" />
        <div className="absolute left-1/2 top-[3%] h-[94%] w-px -translate-x-1/2 bg-white/40" />
        <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40" />

        {/* Home's x already runs low (own goal) -> high (attacking), so it
            renders directly; away's needs mirroring so its own goal lands on
            the opposite edge instead of overlapping home's. */}
        {averagePositions.home.map((player) => (
          <div
            key={`home-${player.playerId}`}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
            style={{ left: `${player.x}%`, top: `${player.y}%` }}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white shadow" style={{ backgroundColor: HOME_COLOR }}>
              {player.jerseyNumber}
            </span>
            <span className="max-w-16 truncate text-[9px] leading-tight text-white drop-shadow">
              <PlayerLabel playerId={player.playerId} fallback={player.name} playerInfoById={playerInfoById} />
            </span>
          </div>
        ))}
        {averagePositions.away.map((player) => (
          <div
            key={`away-${player.playerId}`}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
            style={{ left: `${100 - player.x}%`, top: `${player.y}%` }}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white shadow" style={{ backgroundColor: AWAY_COLOR }}>
              {player.jerseyNumber}
            </span>
            <span className="max-w-16 truncate text-[9px] leading-tight text-white drop-shadow">
              <PlayerLabel playerId={player.playerId} fallback={player.name} playerInfoById={playerInfoById} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MatchAnalytics({ homeTeam, awayTeam, momentum, xgFlow, totalXg, averagePositions, playerInfoById }: MatchAnalyticsProps) {
  const hasAnything = momentum.length > 0 || xgFlow.length > 0 || averagePositions.home.length > 0 || averagePositions.away.length > 0;

  if (!hasAnything) {
    return (
      <div className="max-w-[850px] rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
        No analytics yet -- check back once the match is underway.
      </div>
    );
  }

  return (
    <div className="max-w-[850px] space-y-4">
      <XgFlowCard homeTeam={homeTeam} awayTeam={awayTeam} xgFlow={xgFlow} totalXg={totalXg} />
      <MomentumCard homeTeam={homeTeam} awayTeam={awayTeam} momentum={momentum} />
      <AveragePositionsCard homeTeam={homeTeam} awayTeam={awayTeam} averagePositions={averagePositions} playerInfoById={playerInfoById} />
    </div>
  );
}
