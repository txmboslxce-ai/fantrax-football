"use client";

import AvailabilityIcon from "@/app/components/ui/AvailabilityIcon";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { LineupPlayer, TeamLineup } from "./page";

type Props = {
  lineups: TeamLineup[];
  isAdmin: boolean;
  season: string;
  gameweek: number;
};

// ── colour helpers ────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
function mixColor(a: [number, number, number], b: [number, number, number], ratio: number) {
  const t = clamp(ratio, 0, 1);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}
function spColor(v: number) {
  const red: [number, number, number] = [239, 68, 68];
  const yellow: [number, number, number] = [234, 179, 8];
  const green: [number, number, number] = [42, 122, 59];
  const r = clamp(v, 0, 1);
  if (r <= 0.5) return mixColor(red, yellow, r * 2);
  return mixColor(yellow, green, (r - 0.5) * 2);
}

// ── position badge ────────────────────────────────────────────────────────────

function posBadgeClass(pos: LineupPlayer["position"]) {
  switch (pos) {
    case "G": return "bg-yellow-700/50 text-yellow-200";
    case "D": return "bg-blue-800/50 text-blue-200";
    case "M": return "bg-green-800/50 text-green-200";
    case "F": return "bg-red-800/50 text-red-200";
  }
}

// ── section divider ───────────────────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <tr>
      <td
        colSpan={6}
        className="border-b border-brand-cream/20 bg-brand-dark/40 px-2 py-1 text-center text-[10px] font-bold uppercase tracking-widest text-brand-creamDark/60"
      >
        {label}
      </td>
    </tr>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function LineupPredictorClient({ lineups, isAdmin, season, gameweek }: Props) {
  const router = useRouter();

  const teams = useMemo(() => lineups.map((l) => l.team), [lineups]);
  const [selectedTeam, setSelectedTeam] = useState<string>(teams[0] ?? "");

  const lineup = useMemo(
    () => lineups.find((l) => l.team === selectedTeam) ?? null,
    [lineups, selectedTeam],
  );

  // Admin edit state
  const [editMode, setEditMode] = useState(false);
  // Map playerId → overridden start % string (0–100)
  const [overrides, setOverrides] = useState<Map<string, string>>(new Map());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // When switching teams reset edit state
  function handleTeamChange(team: string) {
    setSelectedTeam(team);
    setOverrides(new Map());
    setEditMode(false);
    setSaveError(null);
  }

  function enterEditMode() {
    if (!lineup) return;
    // Pre-populate overrides map with current values
    const initial = new Map<string, string>();
    for (const p of lineup.players) {
      initial.set(p.playerId, String(Math.round(p.startProbability * 100)));
    }
    setOverrides(initial);
    setEditMode(true);
    setSaveError(null);
  }

  function cancelEditMode() {
    setOverrides(new Map());
    setEditMode(false);
    setSaveError(null);
  }

  // Derive effective start probability for a player (override takes precedence)
  function effectiveSp(player: LineupPlayer): number {
    if (!editMode) return player.startProbability;
    const raw = overrides.get(player.playerId);
    if (raw === undefined) return player.startProbability;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? clamp(parsed / 100, 0, 1) : player.startProbability;
  }

  // Derive sections from current (possibly overridden) data
  const sections = useMemo(() => {
    if (!lineup) return { starters: [], potentials: [], out: [] };

    const POS_ORDER: Record<"G" | "D" | "M" | "F", number> = { G: 0, D: 1, M: 2, F: 3 };

    const out = lineup.players.filter((p) => p.isOut)
      .sort((a, b) => POS_ORDER[a.position] - POS_ORDER[b.position]);

    const active = lineup.players.filter((p) => !p.isOut);
    const starters = active
      .filter((p) => effectiveSp(p) >= 0.5)
      .sort((a, b) => POS_ORDER[a.position] - POS_ORDER[b.position] || effectiveSp(b) - effectiveSp(a));
    const potentials = active
      .filter((p) => effectiveSp(p) < 0.5)
      .sort((a, b) => effectiveSp(b) - effectiveSp(a));

    return { starters, potentials, out };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineup, overrides, editMode]);

  async function handleSave() {
    if (!lineup) return;
    setSaving(true);
    setSaveError(null);

    // Build list of changed players only
    const changed = lineup.players.filter((p) => {
      const raw = overrides.get(p.playerId);
      if (raw === undefined) return false;
      const parsed = Number.parseFloat(raw);
      if (!Number.isFinite(parsed)) return false;
      return Math.abs(clamp(parsed / 100, 0, 1) - p.startProbability) > 0.001;
    });

    if (changed.length === 0) {
      setEditMode(false);
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/lineup-predictor/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          season,
          gameweek,
          overrides: changed.map((p) => ({
            player_id: p.playerId,
            start_probability: clamp(Number.parseFloat(overrides.get(p.playerId) ?? "0") / 100, 0, 1),
          })),
        }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { message?: string };
        setSaveError(body.message ?? "Failed to save overrides.");
        setSaving(false);
        return;
      }

      setEditMode(false);
      setOverrides(new Map());
      router.refresh();
    } catch {
      setSaveError("Network error — could not save overrides.");
    } finally {
      setSaving(false);
    }
  }

  function PlayerRow({ player, index }: { player: LineupPlayer; index: number }) {
    const shade = index % 2 === 0 ? "bg-brand-dark/60" : "bg-brand-dark/90";
    const sp = effectiveSp(player);

    return (
      <tr className={`${shade} text-brand-cream`}>
        {/* Player */}
        <td className={`border-b border-r border-brand-cream/10 px-2 py-1.5 ${shade}`}>
          <div className="flex flex-wrap items-center gap-1 text-sm font-semibold leading-tight">
            <Link href={`/portal/players/${player.playerId}`} className="hover:underline">
              {player.playerName}
            </Link>
            <AvailabilityIcon
              chanceOfPlaying={player.chanceOfPlaying}
              status={player.availabilityStatus}
              news={player.availabilityNews}
            />
          </div>
          <div className="mt-0.5 text-xs text-brand-creamDark/70">
            {player.gamesStarted} starts
          </div>
        </td>

        {/* Position */}
        <td className={`border-b border-r border-brand-cream/10 px-2 py-1.5 text-center ${shade}`}>
          <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold ${posBadgeClass(player.position)}`}>
            {player.position}
          </span>
        </td>

        {/* Prev mins */}
        <td className={`border-b border-r border-brand-cream/10 px-2 py-1.5 text-center text-sm ${shade}`}>
          {player.prevGwMinutes !== null
            ? <span className="font-semibold">{player.prevGwMinutes}</span>
            : <span className="text-brand-creamDark/50">DNP</span>}
        </td>

        {/* Pts/Start */}
        <td className={`border-b border-r border-brand-cream/10 px-2 py-1.5 text-center text-sm font-semibold ${shade}`}>
          {player.ptsPerStart > 0
            ? player.ptsPerStart.toFixed(2)
            : <span className="text-brand-creamDark/50">—</span>}
        </td>

        {/* Start % — editable in admin mode */}
        <td className={`border-b border-brand-cream/10 px-2 py-1.5 text-center ${shade}`}>
          {editMode ? (
            <div className="flex items-center justify-center gap-1">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={overrides.get(player.playerId) ?? ""}
                onChange={(e) =>
                  setOverrides((prev) => {
                    const next = new Map(prev);
                    next.set(player.playerId, e.target.value);
                    return next;
                  })
                }
                className="w-14 rounded border border-brand-green bg-brand-dark px-1.5 py-0.5 text-center text-xs font-bold text-brand-cream focus:outline-none"
              />
              <span className="text-xs text-brand-creamDark">%</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1">
              <span
                className="inline-flex rounded-md px-2 py-0.5 text-xs font-bold text-white"
                style={{ backgroundColor: spColor(sp) }}
              >
                {Math.round(sp * 100)}%
              </span>
            </div>
          )}
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="rounded-xl border border-brand-cream/20 bg-brand-dark px-3 py-2.5">
        <div className="flex flex-wrap items-end gap-3 text-xs">
          <label className="space-y-1 shrink-0">
            <span className="block font-semibold uppercase tracking-wide text-brand-creamDark">Team</span>
            <select
              value={selectedTeam}
              onChange={(e) => handleTeamChange(e.target.value)}
              className="rounded border border-brand-cream/35 bg-brand-dark px-2 py-1 text-xs text-brand-cream focus:border-brand-green focus:outline-none md:w-36"
            >
              {teams.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>

          <p className="pb-1 text-xs text-brand-creamDark">
            Start % ≥ 50% = predicted starter
          </p>

          {/* Admin controls */}
          {isAdmin && !editMode ? (
            <button
              type="button"
              onClick={enterEditMode}
              className="ml-auto rounded border border-amber-400/50 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/20"
            >
              Edit Start %
            </button>
          ) : null}

          {isAdmin && editMode ? (
            <div className="ml-auto flex items-center gap-2">
              {saveError ? (
                <span className="text-xs text-red-400">{saveError}</span>
              ) : null}
              <button
                type="button"
                onClick={cancelEditMode}
                disabled={saving}
                className="rounded border border-brand-cream/35 px-3 py-1.5 text-xs font-semibold text-brand-cream"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded border border-brand-green bg-brand-green px-3 py-1.5 text-xs font-semibold text-brand-cream disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* No predictions */}
      {!lineup ? (
        <div className="rounded-xl border border-brand-cream/20 bg-brand-dark px-4 py-8 text-center text-sm text-brand-creamDark">
          No lineup predictions available. Predictions must be generated first.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-brand-cream/20">
          {/* Team header */}
          <div className="flex items-center justify-between border-b border-brand-cream/20 bg-[#1A4D2E] px-4 py-2.5">
            <span className="text-sm font-black uppercase tracking-wide text-brand-cream">{lineup.team}</span>
            <span className="text-xs font-semibold text-brand-creamDark">GW{lineup.gameweek}</span>
          </div>

          <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr>
                <th className="border-b border-r border-brand-cream/25 bg-[#1a3a22] px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-brand-creamDark">
                  Player
                </th>
                <th className="border-b border-r border-brand-cream/25 bg-[#1a3a22] px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-brand-creamDark">
                  Pos
                </th>
                <th className="border-b border-r border-brand-cream/25 bg-[#1a3a22] px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-brand-creamDark">
                  Prev Mins
                </th>
                <th className="border-b border-r border-brand-cream/25 bg-[#1a3a22] px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-brand-creamDark">
                  Pts/Start
                </th>
                <th className="border-b border-brand-cream/25 bg-[#1a3a22] px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-brand-creamDark">
                  Start %
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Starting XI */}
              {sections.starters.map((p, i) => (
                <PlayerRow key={p.playerId} player={p} index={i} />
              ))}

              {/* Potential Starters */}
              {sections.potentials.length > 0 ? (
                <>
                  <SectionDivider label="Potential Starters" />
                  {sections.potentials.map((p, i) => (
                    <PlayerRow key={p.playerId} player={p} index={sections.starters.length + 1 + i} />
                  ))}
                </>
              ) : null}

              {/* Out */}
              {sections.out.length > 0 ? (
                <>
                  <SectionDivider label="Out" />
                  {sections.out.map((p, i) => (
                    <PlayerRow
                      key={p.playerId}
                      player={p}
                      index={sections.starters.length + sections.potentials.length + 2 + i}
                    />
                  ))}
                </>
              ) : null}

              {lineup.players.length === 0 ? (
                <tr>
                  <td colSpan={5} className="bg-brand-dark/90 px-4 py-4 text-center text-xs text-brand-creamDark">
                    No prediction data for this team.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
