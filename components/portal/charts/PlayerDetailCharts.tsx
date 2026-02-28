"use client";

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
};

export default function PlayerDetailCharts({ pointsByGw, last5, homeAway, breakdown }: PlayerDetailChartsProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-xl border border-brand-cream/20 bg-brand-dark/70 p-4">
        <h3 className="mb-3 text-lg font-bold text-brand-cream">Points by Gameweek</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={pointsByGw} margin={{ top: 12, right: 20, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A7A3B33" />
              <XAxis dataKey="gameweek" stroke="#E8E4D9" />
              <YAxis stroke="#E8E4D9" />
              <Tooltip contentStyle={{ backgroundColor: "#0F1F13", border: "1px solid #E8E4D933", color: "#E8E4D9" }} />
              <Bar dataKey="points" fill="#2A7A3B" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-xl border border-brand-cream/20 bg-brand-dark/70 p-4">
        <h3 className="mb-3 text-lg font-bold text-brand-cream">Last 5 Gameweeks</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={last5} margin={{ top: 20, right: 20, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A7A3B33" />
              <XAxis dataKey="gameweek" stroke="#E8E4D9" />
              <YAxis stroke="#E8E4D9" />
              <Tooltip contentStyle={{ backgroundColor: "#0F1F13", border: "1px solid #E8E4D933", color: "#E8E4D9" }} />
              <Line type="monotone" dataKey="points" stroke="#2A7A3B" strokeWidth={3} dot={{ r: 4, fill: "#2A7A3B" }}>
                <LabelList dataKey="points" position="top" formatter={(value: number) => value.toFixed(1)} />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-xl border border-brand-cream/20 bg-brand-dark/70 p-4">
        <h3 className="mb-3 text-lg font-bold text-brand-cream">Home vs Away Avg</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={homeAway} margin={{ top: 18, right: 20, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A7A3B33" />
              <XAxis dataKey="label" stroke="#E8E4D9" />
              <YAxis stroke="#E8E4D9" />
              <Tooltip contentStyle={{ backgroundColor: "#0F1F13", border: "1px solid #E8E4D933", color: "#E8E4D9" }} />
              <Bar dataKey="value" fill="#2A7A3B" radius={[6, 6, 0, 0]}>
                <LabelList dataKey="value" position="top" formatter={(value: number) => value.toFixed(2)} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-xl border border-brand-cream/20 bg-brand-dark/70 p-4">
        <h3 className="mb-3 text-lg font-bold text-brand-cream">Points Breakdown</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={breakdown} dataKey="value" nameKey="name" outerRadius={95} label={(entry) => `${entry.name}: ${entry.value.toFixed(1)}`}>
                {breakdown.map((slice) => (
                  <Cell key={slice.name} fill={slice.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "#0F1F13", border: "1px solid #E8E4D933", color: "#E8E4D9" }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
