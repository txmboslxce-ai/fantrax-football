"use client";

import { useEffect, useMemo, useState } from "react";

type BsdStarter = {
  id: number;
  name: string;
  shortName: string;
  position: string;
  jerseyNumber: number;
};

type TeamData = {
  teamName: string;
  formation: string;
  starters: BsdStarter[];
};

type OverrideData = {
  formation: string;
  starterBsdIds: number[];
};

type FetchResult = {
  homeTeamAbbrev: string;
  awayTeamAbbrev: string;
  home: TeamData;
  away: TeamData;
  overrides: { home: OverrideData | null; away: OverrideData | null };
};

function parseFormationLineSizes(formation: string): number[] | null {
  const outfield = formation.split("-").map((part) => Number.parseInt(part.trim(), 10));
  if (outfield.length === 0 || outfield.some((size) => !Number.isFinite(size) || size <= 0)) {
    return null;
  }
  return [1, ...outfield];
}

function splitIntoLines<T>(flat: T[], lineSizes: number[]): T[][] {
  const lines: T[][] = [];
  let cursor = 0;
  for (const size of lineSizes) {
    lines.push(flat.slice(cursor, cursor + size));
    cursor += size;
  }
  return lines;
}

function lineLabel(index: number): string {
  if (index === 0) return "Goalkeeper";
  return `Line ${index + 1}`;
}

function TeamEditor({
  fixtureId,
  side,
  team,
  override,
  onSaved,
}: {
  fixtureId: string;
  side: "home" | "away";
  team: TeamData;
  override: OverrideData | null;
  onSaved: (side: "home" | "away", override: OverrideData | null) => void;
}) {
  const starterById = useMemo(() => new Map(team.starters.map((player) => [player.id, player])), [team.starters]);

  const initialFormation = override?.formation ?? team.formation;
  const initialIds = override?.starterBsdIds ?? team.starters.map((player) => player.id);

  const [formationInput, setFormationInput] = useState(initialFormation);
  const [slotIds, setSlotIds] = useState<Array<number | null>>(initialIds);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const lineSizes = parseFormationLineSizes(formationInput);
  const expectedCount = lineSizes ? lineSizes.reduce((sum, size) => sum + size, 0) : null;

  function resizeSlots(nextLineSizes: number[]) {
    const nextCount = nextLineSizes.reduce((sum, size) => sum + size, 0);
    setSlotIds((prev) => {
      const next = prev.slice(0, nextCount);
      while (next.length < nextCount) {
        next.push(null);
      }
      return next;
    });
  }

  function handleFormationChange(value: string) {
    setFormationInput(value);
    const nextSizes = parseFormationLineSizes(value);
    if (nextSizes) {
      resizeSlots(nextSizes);
    }
  }

  const usedIds = new Set(slotIds.filter((id): id is number => id !== null));
  const duplicateIds = slotIds.filter((id, index) => id !== null && slotIds.indexOf(id) !== index);
  const missingSlots = slotIds.some((id) => id === null);
  const canSave = lineSizes !== null && expectedCount === slotIds.length && duplicateIds.length === 0 && !missingSlots;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setMessage(null);

    const response = await fetch("/api/admin/fixture-lineup-override", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fixtureId,
        isHome: side === "home",
        formation: formationInput,
        starterBsdIds: slotIds,
      }),
    });

    const data = (await response.json().catch(() => ({}))) as { message?: string };
    setSaving(false);

    if (!response.ok) {
      setMessage(data.message ?? `Save failed (${response.status})`);
      return;
    }

    setMessage("Saved -- this side's Lineups pitch now uses this order.");
    onSaved(side, { formation: formationInput, starterBsdIds: slotIds as number[] });
  }

  async function handleClear() {
    setClearing(true);
    setMessage(null);

    const response = await fetch(`/api/admin/fixture-lineup-override?fixtureId=${encodeURIComponent(fixtureId)}&isHome=${side === "home"}`, {
      method: "DELETE",
    });

    const data = (await response.json().catch(() => ({}))) as { message?: string };
    setClearing(false);

    if (!response.ok) {
      setMessage(data.message ?? `Clear failed (${response.status})`);
      return;
    }

    setMessage("Override cleared -- back to BSD's own data.");
    setFormationInput(team.formation);
    setSlotIds(team.starters.map((player) => player.id));
    onSaved(side, null);
  }

  return (
    <div className="rounded-xl border border-brand-cream/20 bg-brand-dark/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">{team.teamName}</h2>
        <p className="text-xs text-brand-creamDark">BSD reports: {team.formation}</p>
      </div>

      {override ? <p className="mt-1 text-xs font-semibold text-amber-300">Manual override active for this side.</p> : null}

      <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-brand-creamDark">
        Formation
        <input
          type="text"
          value={formationInput}
          onChange={(event) => handleFormationChange(event.target.value)}
          placeholder="e.g. 4-2-3-1"
          className="mt-1 block w-40 rounded border border-brand-cream/35 bg-brand-dark px-2 py-1.5 text-sm text-brand-cream focus:border-brand-green focus:outline-none"
        />
      </label>

      {!lineSizes ? (
        <p className="mt-2 text-xs text-red-300">Couldn&apos;t parse that formation -- use dash-separated numbers, e.g. &quot;3-4-2-1&quot;.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {splitIntoLines(slotIds, lineSizes).map((lineSlotIds, lineIndex) => {
            const startIndex = lineSizes.slice(0, lineIndex).reduce((sum, size) => sum + size, 0);
            return (
              <div key={lineIndex}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-brand-creamDark">{lineLabel(lineIndex)}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {lineSlotIds.map((slotValue, offset) => {
                    const slotIndex = startIndex + offset;
                    return (
                      <select
                        key={slotIndex}
                        value={slotValue ?? ""}
                        onChange={(event) => {
                          const nextId = event.target.value ? Number.parseInt(event.target.value, 10) : null;
                          setSlotIds((prev) => {
                            const next = [...prev];
                            next[slotIndex] = nextId;
                            return next;
                          });
                        }}
                        className={`min-w-40 rounded border bg-brand-dark px-2 py-1.5 text-sm text-brand-cream focus:outline-none ${
                          slotValue !== null && duplicateIds.includes(slotValue) ? "border-red-400" : "border-brand-cream/35 focus:border-brand-green"
                        }`}
                      >
                        <option value="">Left/right {offset + 1}...</option>
                        {team.starters.map((player) => (
                          <option key={player.id} value={player.id} disabled={usedIds.has(player.id) && slotValue !== player.id}>
                            {player.name} ({player.position})
                          </option>
                        ))}
                      </select>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-[11px] text-brand-creamDark">Order each line left-to-right as the team actually attacks (own goal towards halfway).</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!canSave || saving}
          className="rounded bg-brand-green px-4 py-2 text-sm font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save override"}
        </button>
        {override ? (
          <button
            type="button"
            onClick={() => void handleClear()}
            disabled={clearing}
            className="rounded border border-red-400/50 px-4 py-2 text-sm font-semibold text-red-300 transition-colors hover:bg-red-950/30 disabled:opacity-60"
          >
            {clearing ? "Clearing..." : "Clear override"}
          </button>
        ) : null}
        {message ? <p className="text-sm text-brand-creamDark">{message}</p> : null}
      </div>
      {duplicateIds.length > 0 ? <p className="mt-2 text-xs text-red-300">Each player can only be used once.</p> : null}
      {missingSlots ? <p className="mt-2 text-xs text-red-300">Fill every slot before saving.</p> : null}

      <details className="mt-4 text-xs text-brand-creamDark">
        <summary className="cursor-pointer font-semibold">Starters ({starterById.size})</summary>
        <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {team.starters.map((player) => (
            <li key={player.id}>
              {player.name} <span className="text-brand-creamDark/70">({player.position})</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export default function FixtureLineupOverrideClient({ fixtureId }: { fixtureId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FetchResult | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/admin/fixture-lineup-override?fixtureId=${encodeURIComponent(fixtureId)}`);
      if (!alive) return;

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? `Failed to load (${response.status})`);
        setLoading(false);
        return;
      }

      setData((await response.json()) as FetchResult);
      setLoading(false);
    }

    void load();
    return () => {
      alive = false;
    };
  }, [fixtureId]);

  if (loading) {
    return (
      <div className="min-h-full bg-brand-dark px-4 py-16 text-brand-cream sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-sm text-brand-creamDark">Loading BSD lineup...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-full bg-brand-dark px-4 py-16 text-brand-cream sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-xl border border-red-400/50 bg-red-950/25 p-6 text-sm">{error ?? "Something went wrong."}</div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-brand-dark px-4 py-16 text-brand-cream sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-black sm:text-4xl">Fix Lineup Positions</h1>
        <p className="mt-2 text-sm text-brand-creamDark">
          Corrects the Lineups pitch when BSD&apos;s own formation shape or player ordering is wrong -- e.g. BSD reporting a
          3-4-3 for what was actually played as 3-4-2-1, or a winger who swapped flanks that match. Once saved, this fully
          replaces the automatic layout for that side until you clear it -- it won&apos;t be overwritten later by BSD&apos;s
          own average-position data.
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <TeamEditor
            fixtureId={fixtureId}
            side="home"
            team={data.home}
            override={data.overrides.home}
            onSaved={(side, override) => setData((prev) => (prev ? { ...prev, overrides: { ...prev.overrides, [side]: override } } : prev))}
          />
          <TeamEditor
            fixtureId={fixtureId}
            side="away"
            team={data.away}
            override={data.overrides.away}
            onSaved={(side, override) => setData((prev) => (prev ? { ...prev, overrides: { ...prev.overrides, [side]: override } } : prev))}
          />
        </div>
      </div>
    </div>
  );
}
