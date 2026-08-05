"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";

type Point = {
  gameweek: number;
  points: number;
};

type MiniSparklineProps = {
  data: Point[];
};

export default function MiniSparkline({ data }: MiniSparklineProps) {
  return (
    <div className="h-16 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line type="monotone" dataKey="points" stroke="#005B3A" strokeWidth={2.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
