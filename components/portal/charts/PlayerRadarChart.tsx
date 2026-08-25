"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";

type PlayerRadarDatum = {
  stat: string;
  value: number;
};

type PlayerRadarChartProps = {
  title: string;
  data: PlayerRadarDatum[];
  color: string;
  caption: string;
};

export default function PlayerRadarChart({ title, data, color, caption }: PlayerRadarChartProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3">
      <h3 className="text-sm font-bold text-brand-dark">{title}</h3>
      <p className="mt-0.5 text-xs text-slate-500">{caption}</p>
      <div className="mt-2 h-52">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="66%" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
            <PolarGrid stroke="#CBD5E1" />
            <PolarAngleAxis dataKey="stat" tick={{ fill: "#475569", fontSize: 10 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} />
            <Radar dataKey="value" stroke={color} fill={color} fillOpacity={0.16} strokeWidth={2} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
