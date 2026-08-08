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
    <section className="rounded-xl border border-brand-cream/20 bg-brand-dark/70 p-4">
      <h3 className="text-lg font-bold text-brand-cream">{title}</h3>
      <p className="mt-1 text-sm text-brand-creamDark">{caption}</p>
      <div className="mt-3 h-80">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="68%">
            <PolarGrid stroke="#E8E4D933" />
            <PolarAngleAxis dataKey="stat" tick={{ fill: "#E8E4D9", fontSize: 11 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} />
            <Radar dataKey="value" stroke={color} fill={color} fillOpacity={0.16} strokeWidth={2} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
