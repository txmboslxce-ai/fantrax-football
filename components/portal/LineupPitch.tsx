import Link from "next/link";
import { coarsePositionGroup, horizontalOrder, PITCH_ROWS, type CoarsePosition } from "@/lib/rotowire/position";

export type PitchPlayer = {
  id: string;
  name: string;
  position: string | null;
};

const ROW_ORDER_TOP_TO_BOTTOM: CoarsePosition[] = [...PITCH_ROWS].reverse();

function PlayerToken({ player }: { player: PitchPlayer }) {
  return (
    <Link
      href={`/portal/players/${player.id}`}
      prefetch={false}
      className="group flex w-14 flex-col items-center gap-1 text-center sm:w-16"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white bg-brand-dark text-[10px] font-bold text-brand-cream shadow transition-colors group-hover:bg-brand-greenLight sm:h-9 sm:w-9 sm:text-[11px]">
        {player.position ?? ""}
      </span>
      <span className="line-clamp-2 text-[10px] font-semibold leading-tight text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.6)] sm:text-[11px]">
        {player.name}
      </span>
    </Link>
  );
}

export default function LineupPitch({ teamLabel, players }: { teamLabel: string; players: PitchPlayer[] }) {
  // Players without a resolvable position (currently just anything that
  // slipped through without a RotoWire position code) are left off the
  // pitch entirely rather than guessing where to place them.
  const positioned = players.filter((player) => coarsePositionGroup(player.position) !== null);

  const rowsByGroup = new Map<CoarsePosition, PitchPlayer[]>();
  for (const group of PITCH_ROWS) {
    rowsByGroup.set(
      group,
      positioned
        .filter((player) => coarsePositionGroup(player.position) === group)
        .sort((a, b) => horizontalOrder(a.position) - horizontalOrder(b.position))
    );
  }

  const formation = (["DEF", "MID", "FWD"] as const)
    .map((group) => rowsByGroup.get(group)?.length ?? 0)
    .join("-");

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-baseline justify-between border-b border-slate-200 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{teamLabel}</p>
        {positioned.length > 0 ? <p className="text-[11px] text-slate-400">{formation}</p> : null}
      </div>

      <div
        className="relative flex flex-col justify-around gap-3 overflow-hidden bg-brand-green px-2 py-4"
        style={{
          minHeight: 320,
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 32px, transparent 32px, transparent 64px)",
        }}
      >
        {/* Halfway line + center-circle arc at the top of this team's own half */}
        <div className="pointer-events-none absolute inset-x-2 top-0 border-t-2 border-white/30" aria-hidden />
        <div
          className="pointer-events-none absolute left-1/2 top-0 h-9 w-20 -translate-x-1/2 rounded-b-full border-2 border-t-0 border-white/30"
          aria-hidden
        />
        {/* Penalty box in front of the goalkeeper row */}
        <div className="pointer-events-none absolute inset-x-[22%] bottom-0 h-14 border-2 border-b-0 border-white/30" aria-hidden />

        {positioned.length === 0 ? (
          <p className="relative z-10 my-auto text-center text-xs font-semibold text-white/80">Not yet available</p>
        ) : (
          ROW_ORDER_TOP_TO_BOTTOM.map((group) => {
            const rowPlayers = rowsByGroup.get(group) ?? [];
            if (rowPlayers.length === 0) return null;
            return (
              <div key={group} className="relative z-10 flex flex-wrap items-start justify-evenly gap-x-1 gap-y-2">
                {rowPlayers.map((player) => (
                  <PlayerToken key={player.id} player={player} />
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
