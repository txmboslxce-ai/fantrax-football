// Percentage-coordinate pitch layout for predicted lineups, adapted from
// lib/portal/formationLayout.ts's layoutTeam (used for BSD's confirmed
// match formations). That version parses a real formation string like
// "4-2-3-1" into lines; RotoWire gives us individual position codes with
// no formation string at all, so lines here are built dynamically from
// each player's own position (see pitchBand in ./position) instead. The
// along/across percentage math -- and the pitch visual it's meant to
// drive -- follows the same approach on purpose, so a predicted lineup and
// a confirmed one read as the same kind of graphic.
import { PITCH_BAND_ORDER, horizontalOrder, pitchBand, type PitchBand } from "@/lib/rotowire/position";

export type PositionedLineupPlayer<T> = {
  player: T;
  band: PitchBand;
  alongPct: number;
  acrossPct: number;
};

const OWN_GOAL_PCT = 8;
// Close enough to the halfway line (50) that the frontmost line sits inside
// their own half of the center circle -- same reasoning as formationLayout.
const HALFWAY_APPROACH_PCT = 44;
const ACROSS_MIN_PCT = 14;
const ACROSS_MAX_PCT = 86;

type Line<T> = { band: PitchBand; players: T[] };

function groupIntoLines<T>(players: T[], positionOf: (player: T) => string | null): Line<T>[] {
  const byBand = new Map<PitchBand, T[]>();
  for (const player of players) {
    const band = pitchBand(positionOf(player));
    if (!band) continue;
    const list = byBand.get(band) ?? [];
    list.push(player);
    byBand.set(band, list);
  }

  return PITCH_BAND_ORDER.map((band) => ({ band, players: byBand.get(band) ?? [] })).filter((line) => line.players.length > 0);
}

// alongPct runs 0 (own goal line) -> 50 (halfway) along whichever axis the
// team attacks; acrossPct is the spread within a band, perpendicular to
// that -- same coordinate space formationLayout's layoutTeam uses, so the
// same pitch-rendering component can consume either. A band's spread
// scales with its own size relative to the team's widest band (usually the
// back line), so e.g. a 2-man double pivot sits clustered near the middle
// rather than flung out to the same edges as a back four.
export function layoutPredictedTeam<T>(
  players: T[],
  positionOf: (player: T) => string | null,
  attackingTowardHigherPct: boolean
): PositionedLineupPlayer<T>[] {
  const lines = groupIntoLines(players, positionOf);
  const lineCount = lines.length;
  if (lineCount === 0) {
    return [];
  }

  const widestLine = Math.max(...lines.map((line) => line.players.length));
  const fullSpread = ACROSS_MAX_PCT - ACROSS_MIN_PCT;

  return lines.flatMap((line, lineIndex) => {
    const along =
      lineCount === 1 ? OWN_GOAL_PCT : OWN_GOAL_PCT + (lineIndex * (HALFWAY_APPROACH_PCT - OWN_GOAL_PCT)) / (lineCount - 1);
    const alongPct = attackingTowardHigherPct ? along : 100 - along;

    const orderedPlayers = [...line.players].sort((a, b) => horizontalOrder(positionOf(a)) - horizontalOrder(positionOf(b)));
    const lineSpread = fullSpread * (orderedPlayers.length / widestLine);
    const acrossStart = 50 - lineSpread / 2;

    return orderedPlayers.map((player, playerIndex) => {
      const acrossPct = orderedPlayers.length === 1 ? 50 : acrossStart + (playerIndex * lineSpread) / (orderedPlayers.length - 1);
      return { player, band: line.band, alongPct, acrossPct };
    });
  });
}
