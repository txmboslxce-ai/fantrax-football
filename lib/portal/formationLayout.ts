import type { BsdLineupPlayer } from "@/lib/bsd/lineups";

export type PositionedPlayer = {
  player: BsdLineupPlayer;
  alongPct: number;
  acrossPct: number;
};

const OWN_GOAL_PCT = 8;
const HALFWAY_APPROACH_PCT = 48;
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

// alongPct runs 0 (own goal line) -> 50 (halfway) along whichever axis the
// team attacks; acrossPct is the spread within a line, perpendicular to
// that. Rendering maps these onto real x/y for horizontal vs vertical pitch
// orientations -- see FixtureFormationPitch.
export function layoutTeam(lines: BsdLineupPlayer[][], attackingTowardHigherPct: boolean): PositionedPlayer[] {
  const lineCount = lines.length;

  return lines.flatMap((line, lineIndex) => {
    const along =
      lineCount === 1 ? OWN_GOAL_PCT : OWN_GOAL_PCT + (lineIndex * (HALFWAY_APPROACH_PCT - OWN_GOAL_PCT)) / (lineCount - 1);
    const alongPct = attackingTowardHigherPct ? along : 100 - along;

    return line.map((player, playerIndex) => {
      const acrossPct =
        line.length === 1 ? 50 : ACROSS_MIN_PCT + (playerIndex * (ACROSS_MAX_PCT - ACROSS_MIN_PCT)) / (line.length - 1);
      return { player, alongPct, acrossPct };
    });
  });
}
