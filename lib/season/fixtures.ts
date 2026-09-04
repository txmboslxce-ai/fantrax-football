/**
 * Fixtures are published for the upcoming 2026-27 campaign independently of
 * the historical season that may still be marked current elsewhere in the app.
 */
export const FIXTURES_SEASON = "2026-27";

// The completed season immediately before FIXTURES_SEASON -- used by the
// projection engine as a personalized prior (a player's own established
// per-90 rate from last season) instead of a generic position average, for
// exactly the players who have one. Bump this alongside FIXTURES_SEASON each
// year.
export const PRIOR_SEASON = "2025-26";
