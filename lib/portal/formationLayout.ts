import type { BsdLineupPlayer } from "@/lib/bsd/lineups";

export type PositionedPlayer = {
  player: BsdLineupPlayer;
  alongPct: number;
  acrossPct: number;
};

const OWN_GOAL_PCT = 8;
// Close enough to the halfway line (50) that the frontmost line -- often a
// lone striker -- sits inside their own half of the center circle, the way
// broadcast lineup graphics place the two front players flanking it.
const HALFWAY_APPROACH_PCT = 44;
const ACROSS_MIN_PCT = 14;
const ACROSS_MAX_PCT = 86;

// Splits the starting XI into goalkeeper + outfield lines per the formation
// string (e.g. "4-2-3-1" -> [1, 4, 2, 3, 1]). Returns null on anything
// unexpected (a formation string that doesn't parse, or a line-size total
// that doesn't match the starters we actually got) so the caller can fall
// back to a plain list rather than render a bogus pitch layout.
export function groupByFormation(starters: BsdLineupPlayer[], formation: string): BsdLineupPlayer[][] | null {
  const outfieldLines = formation.split("-").map((part) => Number.parseInt(part, 10));
  if (outfieldLines.some((size) => !Number.isFinite(size) || size <= 0)) {
    return null;
  }

  const lineSizes = [1, ...outfieldLines];
  if (lineSizes.reduce((sum, size) => sum + size, 0) !== starters.length) {
    return null;
  }

  const lines: BsdLineupPlayer[][] = [];
  let cursor = 0;
  for (const size of lineSizes) {
    lines.push(starters.slice(cursor, cursor + size));
    cursor += size;
  }
  return lines;
}

// BSD's starters array order within a formation line doesn't necessarily
// reflect which side of the pitch each player actually occupied that match
// (a fullback and winger can swap flanks from their nominal role) -- the
// average-positions data does capture that, so reorder each line by it
// before laying players out left-to-right, rather than trusting array
// order. Players missing a value (e.g. average positions not populated
// yet) sort after everyone with one, keeping their relative order.
export function reorderLineByAcrossValue(line: BsdLineupPlayer[], acrossValueById: Map<number, number>): BsdLineupPlayer[] {
  return [...line].sort((a, b) => {
    const aValue = acrossValueById.get(a.id);
    const bValue = acrossValueById.get(b.id);
    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return 1;
    if (bValue == null) return -1;
    return aValue - bValue;
  });
}

// alongPct runs 0 (own goal line) -> 50 (halfway) along whichever axis the
// team attacks; acrossPct is the spread within a line, perpendicular to
// that. Rendering maps these onto real x/y for horizontal vs vertical pitch
// orientations -- see FixtureFormationPitch.
//
// A line's spread scales with its own size relative to the team's widest
// line (usually the back line), so e.g. a 2-man double pivot sits clustered
// near the middle rather than flung out to the same edges as a back four.
export function layoutTeam(lines: BsdLineupPlayer[][], attackingTowardHigherPct: boolean): PositionedPlayer[] {
  const lineCount = lines.length;
  const widestLine = Math.max(...lines.map((line) => line.length));
  const fullSpread = ACROSS_MAX_PCT - ACROSS_MIN_PCT;

  return lines.flatMap((line, lineIndex) => {
    const along =
      lineCount === 1 ? OWN_GOAL_PCT : OWN_GOAL_PCT + (lineIndex * (HALFWAY_APPROACH_PCT - OWN_GOAL_PCT)) / (lineCount - 1);
    const alongPct = attackingTowardHigherPct ? along : 100 - along;

    const lineSpread = fullSpread * (line.length / widestLine);
    const acrossStart = 50 - lineSpread / 2;

    return line.map((player, playerIndex) => {
      const acrossPct = line.length === 1 ? 50 : acrossStart + (playerIndex * lineSpread) / (line.length - 1);
      return { player, alongPct, acrossPct };
    });
  });
}
