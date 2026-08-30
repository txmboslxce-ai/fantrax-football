import type { SupabaseClient } from "@supabase/supabase-js";
import type { BsdLineupPlayer, BsdTeamLineup } from "@/lib/bsd/lineups";

export type FixtureLineupOverride = {
  formation: string;
  starterBsdIds: number[];
};

type OverrideRow = {
  is_home: boolean;
  formation: string;
  starter_bsd_ids: number[];
};

export async function getFixtureLineupOverrides(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  fixtureId: string
): Promise<{ home: FixtureLineupOverride | null; away: FixtureLineupOverride | null }> {
  const { data, error } = await supabase.from("fixture_lineup_overrides").select("is_home, formation, starter_bsd_ids").eq("fixture_id", fixtureId);

  if (error) {
    throw new Error(`Unable to load fixture lineup overrides: ${error.message}`);
  }

  const rows = (data ?? []) as OverrideRow[];
  const home = rows.find((row) => row.is_home);
  const away = rows.find((row) => !row.is_home);

  return {
    home: home ? { formation: home.formation, starterBsdIds: home.starter_bsd_ids } : null,
    away: away ? { formation: away.formation, starterBsdIds: away.starter_bsd_ids } : null,
  };
}

// Reorders `lineup.starters` (and swaps in the corrected formation string)
// to match a manually-fixed layout, so it flows through groupByFormation
// exactly like BSD's own data would. Falls back to the unmodified lineup if
// the override doesn't cleanly cover the same 11 players -- e.g. BSD later
// changes a starter due to a data correction -- rather than rendering a
// broken pitch.
export function applyLineupOverride(lineup: BsdTeamLineup, override: FixtureLineupOverride): BsdTeamLineup {
  const starterById = new Map<number, BsdLineupPlayer>(lineup.starters.map((player) => [player.id, player]));

  if (override.starterBsdIds.length !== lineup.starters.length) {
    return lineup;
  }

  const reordered: BsdLineupPlayer[] = [];
  for (const bsdId of override.starterBsdIds) {
    const player = starterById.get(bsdId);
    if (!player) {
      return lineup;
    }
    reordered.push(player);
  }

  return { ...lineup, formation: override.formation, starters: reordered };
}
