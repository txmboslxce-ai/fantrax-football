// sports.bzzoiro.com numeric team id -> our teams.abbrev, built by matching
// the current Premier League standings' team names against our existing
// team names (same approach, and the same resulting abbrevs, as
// FPL_ID_TO_ABBREV in lib/fpl/sync.ts). Promotion/relegation will make this
// stale season to season -- update it alongside FPL_ID_TO_ABBREV.
export const BSD_TEAM_ID_TO_ABBREV: Record<number, string> = {
  18: "ARS",
  3: "AVL",
  2: "BOU",
  16: "BRF",
  5: "BHA",
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
};
