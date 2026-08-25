"use client";

import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { scoreColor } from "@/lib/portal/scoreColor";

type PlayedGameweekPoint = {
  gameweek: number;
  points: number;
};

type HomeAwayPoint = {
  label: string;
  value: number;
};

type BreakdownPoint = {
  name: string;
  value: number;
  color: string;
};

type PlayerFormPanelProps = {
  pointsByGw: PlayedGameweekPoint[];
  last5: PlayedGameweekPoint[];
  homeAway: HomeAwayPoint[];
  breakdown: BreakdownPoint[];
};

function splitBarSegments(points: HomeAwayPoint[]) {
  const total = points.reduce((sum, point) => sum + Math.max(0, point.value), 0);
  if (total <= 0) {
    return points.map((point) => ({ ...point, pct: 100 / points.length }));
  }
  return points.map((point) => ({ ...point, pct: (Math.max(0, point.value) / total) * 100 }));
}

export default function PlayerFormPanel({ pointsByGw, last5, homeAway, breakdown }: PlayerFormPanelProps) {
  const homeAwaySegments = splitBarSegments(homeAway);
  const breakdownTotal = breakdown.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);

  return (
    <section className="grid h-full gap-4 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 xl:grid-cols-1">
      <div>
        <h3 className="text-sm font-bold text-brand-dark">Season Trend</h3>
        {pointsByGw.length > 1 ? (
          <div className="mt-1 h-14">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={pointsByGw} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <YAxis hide domain={["dataMin - 2", "dataMax + 2"]} />
                <Line type="monotone" dataKey="points" stroke="#005B3A" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-1 text-xs text-slate-500">Not enough gameweeks yet for a trend line.</p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-bold text-brand-dark">Last 5 Gameweeks</h3>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {last5.length > 0 ? (
            last5.map((point) => (
              <div
                key={point.gameweek}
                className="flex h-9 w-9 flex-col items-center justify-center rounded-lg text-[11px] font-bold leading-none text-white"
                style={{ backgroundColor: scoreColor(point.points) }}
                title={`GW${point.gameweek}: ${point.points.toFixed(2)} pts`}
              >
                <span>{point.points.toFixed(0)}</span>
                <span className="mt-0.5 text-[9px] font-medium opacity-80">GW{point.gameweek}</span>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-500">No recent gameweeks played.</p>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-brand-dark">Home vs Away</h3>
        <div className="mt-1.5 flex h-4 overflow-hidden rounded-full bg-slate-100">
          {homeAwaySegments.map((segment) => (
            <div
              key={segment.label}
              style={{ width: `${segment.pct}%` }}
              className={segment.label === "Home" ? "bg-brand-green" : "bg-amber-500"}
              title={`${segment.label}: ${segment.value.toFixed(2)}`}
            />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-xs text-slate-600">
          {homeAway.map((point) => (
            <span key={point.label}>
              {point.label}: <strong className="text-brand-dark">{point.value.toFixed(2)}</strong>
            </span>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-brand-dark">Points Breakdown</h3>
        <div className="mt-1.5 flex h-4 overflow-hidden rounded-full bg-slate-100">
          {breakdown.map((slice) => (
            <div
              key={slice.name}
              style={{ width: `${breakdownTotal > 0 ? (Math.max(0, slice.value) / breakdownTotal) * 100 : 100 / breakdown.length}%`, backgroundColor: slice.color }}
              title={`${slice.name}: ${slice.value.toFixed(2)}`}
            />
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-slate-600">
          {breakdown.map((slice) => (
            <span key={slice.name} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: slice.color }} />
              {slice.name}: <strong className="text-brand-dark">{slice.value.toFixed(2)}</strong>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
