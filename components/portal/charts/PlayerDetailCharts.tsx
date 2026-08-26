"use client";

import type { ReactNode } from "react";
import PlayerFormPanel from "./PlayerFormPanel";

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
    <div className="grid gap-4 xl:grid-cols-4">
      {radarCharts ? <div className="xl:col-span-3">{radarCharts}</div> : null}
      <div className="xl:col-span-1">
        <PlayerFormPanel pointsByGw={pointsByGw} last5={last5} homeAway={homeAway} breakdown={breakdown} />
      </div>
    </div>
  );
}
