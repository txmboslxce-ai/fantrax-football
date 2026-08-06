/**
 * The season whose pool identifies which players can be drafted this year
 * (including this year's rosters and transfers). This is intentionally not
 * derived from getCurrentSeason() or seasons.is_current.
 */
export const DRAFT_POOL_SEASON = "2026-27";

/**
 * The season whose historical gameweek stats inform the draft decision:
 * 2026-27 has not started and therefore has no gameweek data yet. This is
 * intentionally not derived from getCurrentSeason() or seasons.is_current.
 */
export const DRAFT_STATS_SEASON = "2025-26";
