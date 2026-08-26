"use client";

import { percentileColor } from "@/lib/portal/scoreColor";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";

export type RadarStatPoint = {
  stat: string;
  shortLabel?: string;
  rawValue: number;
  percentile: number;
  value: number;
};

export type RadarPlayerSeries = {
  id: string;
  name: string;
  color: string;
  data: RadarStatPoint[];
};

type PercentileRadarChartProps = {
  title: string;
  caption?: string;
  players: RadarPlayerSeries[];
  height?: number;
};

function AxisTick({ payload, x, y, textAnchor, fullLabelByShort }: {
  payload?: { value: string };
  x?: number;
  y?: number;
  textAnchor?: string;
  fullLabelByShort: Map<string, string>;
}) {
  if (!payload) return null;
  const shortLabel = payload.value;
  const fullLabel = fullLabelByShort.get(shortLabel);
  return (
    <g transform={`translate(${x},${y})`}>
      {fullLabel && fullLabel !== shortLabel ? <title>{fullLabel}</title> : null}
      <text x={0} y={0} textAnchor={textAnchor as "start" | "middle" | "end" | undefined} fill="#475569" fontSize={10}>
        {shortLabel}
      </text>
    </g>
  );
}

export default function PercentileRadarChart({ title, caption, players, height = 224 }: PercentileRadarChartProps) {
  const statLabels = players[0]?.data.map((point) => point.stat) ?? [];
  const fullLabelByShort = new Map<string, string>();

  const mergedData = statLabels.map((stat, index) => {
    const row: Record<string, string | number> = {
      stat,
      axisLabel: players[0]?.data[index]?.shortLabel ?? stat,
    };
    fullLabelByShort.set(row.axisLabel as string, stat);

    for (const player of players) {
      const point = player.data[index];
      row[player.id] = point?.value ?? 0;
      row[`${player.id}__pct`] = point?.percentile ?? 0;
      row[`${player.id}__raw`] = point?.rawValue ?? 0;
    }

    return row;
  });

  const hasData = mergedData.length > 0 && players.length > 0;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3">
      <h3 className="text-sm font-bold text-brand-dark">{title}</h3>
      {caption ? <p className="mt-0.5 text-xs text-slate-500">{caption}</p> : null}
      <div className="mt-2" style={{ height }}>
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={mergedData} outerRadius="66%" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
              <PolarGrid stroke="#CBD5E1" />
              <PolarAngleAxis
                dataKey="axisLabel"
                tick={(props) => <AxisTick {...props} fullLabelByShort={fullLabelByShort} />}
              />
              <PolarRadiusAxis domain={[0, 100]} tick={false} />
              {players.map((player) => (
                <Radar
                  key={player.id}
                  name={player.name}
                  dataKey={player.id}
                  stroke={player.color}
                  fill={player.color}
                  fillOpacity={players.length > 1 ? 0.08 : 0.16}
                  strokeWidth={2}
                  dot={(dotProps: { cx?: number; cy?: number; payload?: Record<string, number> }) => {
                    const { cx, cy, payload } = dotProps;
                    const pct = payload?.[`${player.id}__pct`] ?? 0;
                    return (
                      <circle
                        key={`${player.id}-${cx}-${cy}`}
                        cx={cx}
                        cy={cy}
                        r={3.5}
                        fill={percentileColor(pct)}
                        stroke={player.color}
                        strokeWidth={1}
                      />
                    );
                  }}
                />
              ))}
            </RadarChart>
          </ResponsiveContainer>
        ) : (
          <p className="flex h-full items-center justify-center text-center text-xs text-slate-500">Not enough data yet.</p>
        )}
      </div>
      {players.length > 1 ? (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {players.map((player) => (
            <span key={player.id} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-dark">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: player.color }} />
              {player.name}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
