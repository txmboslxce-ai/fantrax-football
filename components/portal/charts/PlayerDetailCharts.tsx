"use client";

import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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

type PlayerDetailChartsProps = {
  pointsByGw: PlayedGameweekPoint[];
  last5: PlayedGameweekPoint[];
  homeAway: HomeAwayPoint[];
  breakdown: BreakdownPoint[];
  radarCharts?: ReactNode;
};

export default function PlayerDetailCharts({ pointsByGw, last5, homeAway, breakdown, radarCharts }: PlayerDetailChartsProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {radarCharts ? <div className="lg:col-span-2">{radarCharts}</div> : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-lg font-bold text-brand-dark">Points by Gameweek</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={pointsByGw} margin={{ top: 12, right: 20, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" />
              <XAxis dataKey="gameweek" stroke="#64748B" />
              <YAxis stroke="#64748B" />
              <Tooltip contentStyle={{ backgroundColor: "#FFFFFF", border: "1px solid #CBD5E1", color: "#0F1F13" }} />
              <Bar dataKey="points" fill="#005B3A" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-lg font-bold text-brand-dark">Last 5 Gameweeks</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={last5} margin={{ top: 20, right: 20, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" />
              <XAxis dataKey="gameweek" stroke="#64748B" />
              <YAxis stroke="#64748B" />
              <Tooltip contentStyle={{ backgroundColor: "#FFFFFF", border: "1px solid #CBD5E1", color: "#0F1F13" }} />
              <Line type="monotone" dataKey="points" stroke="#005B3A" strokeWidth={3} dot={{ r: 4, fill: "#005B3A" }}>
                <LabelList dataKey="points" position="top" formatter={(value: number) => value.toFixed(2)} />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-lg font-bold text-brand-dark">Home vs Away Avg</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={homeAway} margin={{ top: 18, right: 20, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" />
              <XAxis dataKey="label" stroke="#64748B" />
              <YAxis stroke="#64748B" />
              <Tooltip contentStyle={{ backgroundColor: "#FFFFFF", border: "1px solid #CBD5E1", color: "#0F1F13" }} />
              <Bar dataKey="value" fill="#005B3A" radius={[6, 6, 0, 0]}>
                <LabelList dataKey="value" position="top" formatter={(value: number) => value.toFixed(2)} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-lg font-bold text-brand-dark">Points Breakdown</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={breakdown} dataKey="value" nameKey="name" outerRadius={95} label={(entry) => `${entry.name}: ${entry.value.toFixed(2)}`}>
                {breakdown.map((slice) => (
                  <Cell key={slice.name} fill={slice.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "#FFFFFF", border: "1px solid #CBD5E1", color: "#0F1F13" }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
