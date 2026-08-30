// Shared between the RotoWire sync (matching + storage) and the pitch-view
// rendering on /portal/lineups, so both sides agree on what a translated
// position code means.

// RotoWire's own position codes, translated to the codes the rest of the
// app uses. Any code not listed here (GK, and the generic D/M/F/F-M codes
// RotoWire uses in its Injuries footnote) is left as-is -- those footnote
// entries are filtered out during parsing before they ever reach this map,
// and GK doesn't need translating.
const ROTOWIRE_POSITION_MAP: Record<string, string> = {
  DC: "CB",
  DL: "LB",
  DR: "RB",
  ML: "LM",
  MR: "RM",
  MC: "CM",
  DMC: "DM",
  AML: "LW",
  AMR: "RW",
  AMC: "CAM",
  FW: "FW",
};

export function translateRotowirePosition(position: string | null): string | null {
  if (!position) return null;
  return ROTOWIRE_POSITION_MAP[position] ?? position;
}

// Groups a translated position code into the coarse group Fantrax (and
// players.position) uses. Used to (a) disambiguate RotoWire's bare-first-name
// entries against same-first-name teammates, and (b) place players into the
// right row of the pitch view.
export type CoarsePosition = "GK" | "DEF" | "MID" | "FWD";

const COARSE_POSITION_GROUP: Record<string, CoarsePosition> = {
  GK: "GK",
  CB: "DEF",
  LB: "DEF",
  RB: "DEF",
  DM: "MID",
  CM: "MID",
  LM: "MID",
  RM: "MID",
  CAM: "MID",
  LW: "FWD",
  RW: "FWD",
  FW: "FWD",
};

export function coarsePositionGroup(position: string | null): CoarsePosition | null {
  if (!position) return null;
  return COARSE_POSITION_GROUP[position] ?? null;
}

// Row order for the pitch view, goalkeeper nearest the bottom (own goal)
// through to forwards at the top, matching the usual fantasy-pitch convention.
export const PITCH_ROWS: CoarsePosition[] = ["GK", "DEF", "MID", "FWD"];

// Left-to-right placement within a row. Codes without a side (CB, DM, CM,
// CAM, FW, GK) sit centered; anything else falls back to centered too.
const HORIZONTAL_ORDER: Record<string, number> = {
  LB: 0,
  LM: 0,
  LW: 0,
  RB: 2,
  RM: 2,
  RW: 2,
};

export function horizontalOrder(position: string | null): number {
  if (!position) return 1;
  return HORIZONTAL_ORDER[position] ?? 1;
}
