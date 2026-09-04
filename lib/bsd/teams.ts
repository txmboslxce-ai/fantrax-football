// sports.bzzoiro.com numeric team id -> our teams.abbrev, built by matching
// the current Premier League standings' team names against our existing
// team names (same approach, and the same resulting abbrevs, as
// FPL_ID_TO_ABBREV in lib/fpl/sync.ts). Promotion/relegation will make this
// stale season to season -- update it alongside FPL_ID_TO_ABBREV.
//
// WHU/BUR/WOL (8/10/11) were relegated out of the current top flight and so
// aren't part of "current standings", but are still needed to backfill
// PRIOR_SEASON's BSD match stats for them -- resolved via the
// /admin/upload "Resolve BSD Team IDs" panel (lib/bsd/matchStatsBackfill.ts
// season-wide event search + that event's lineups for the team name).
export const BSD_TEAM_ID_TO_ABBREV: Record<number, string> = {
  18: "ARS",
  3: "AVL",
  2: "BOU",
  16: "BRF",
  5: "BHA",
  10: "BUR",
  13: "CHE",
  203: "COV",
  14: "CRY",
  20: "EVE",
  6: "FUL",
  204: "HUL",
  200: "IPS",
  19: "LEE",
  1: "LIV",
  12: "MCI",
  17: "MUN",
  4: "NEW",
  15: "NOT",
  9: "TOT",
  7: "SUN",
  8: "WHU",
  11: "WOL",
};

export const BSD_ABBREV_TO_TEAM_ID: Record<string, number> = Object.fromEntries(
  Object.entries(BSD_TEAM_ID_TO_ABBREV).map(([teamId, abbrev]) => [abbrev, Number(teamId)])
);
