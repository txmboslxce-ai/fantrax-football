import { findBsdEventId } from "@/lib/bsd/events";
import { fetchBsdEventStats } from "@/lib/bsd/eventStats";

export type RosterPlayerInfo = {
  fantraxId: string;
  name: string;
};

export type GameweekFixture = {
  id: string;
  homeAbbrev: string;
  awayAbbrev: string;
  kickoffAt: string | null;
};

export type PooledShot = {
  fantraxId: string;
  playerName: string;
  fixtureId: string;
  opponentAbbrev: string;
  isHome: boolean;
  minute: number;
  type: string;
  situation: string;
  body: string;
  xg: number;
  // Canonical "always attacking right" coordinates -- see the note below on
  // why this needs no home/away branching, unlike average positions.
  x: number;
  y: number;
};

export type PooledAveragePosition = {
  fantraxId: string;
  playerName: string;
  fixtureId: string;
  opponentAbbrev: string;
  jerseyNumber: number;
  position: string;
  x: number;
  y: number;
};

export type TeamGraphsData = {
  shots: PooledShot[];
  averagePositions: PooledAveragePosition[];
};

// Pools shots and average positions for a set of roster players (identified
// by BSD id) across every fixture in a single gameweek, normalizing every
// player onto one shared "always attacking right" canonical pitch rather
// than the real match's own home/away orientation -- there's no second team
// to share the pitch with here, just whichever of the viewer's own players
// took the shot or touched the ball that week, regardless of which real
// team's shirt they were wearing or which end they actually shot at.
//
// Shot x/y need no per-shot home/away branching: BsdShot's x is already
// "distance from the goal being shot at" and y is already consistent,
// independent of which physical end it happened at or who was home (see
// lib/bsd/eventStats.ts) -- that's exactly the canonical "attacking right"
// frame already, once x is flipped so closer-to-goal renders near the right
// edge.
//
// Average positions are different, and easy to get wrong here: on the
// fixture page's Analytics tab, home and away get *different* treatment
// (home's x renders as-is, away's is mirrored; home's y is flipped, away's
// isn't) -- but that asymmetry exists purely so two *opposing* teams can
// share one pitch image without their attacking thirds overlapping. It has
// nothing to do with either team's real-world side. Pooling a fantasy
// roster has no opponent sharing the canvas, so applying that same
// asymmetry here was a bug: it rendered two genuinely same-side players
// (e.g. two right-sided attackers, each home in one real match and away in
// another) on opposite ends of the pooled pitch, purely because of which
// side they happened to be listed on in their own unrelated match.
// Every row gets identical treatment instead: x already means "progress
// toward this player's own attack" regardless of home/away, so it's used
// as-is; y uses the same flip validated for home on the fixture page (the
// only case actually checked against a real match), applied uniformly
// rather than only to rows that happened to come from the home array.
export async function fetchTeamGraphsData(fixtures: GameweekFixture[], bsdIdToPlayer: Map<number, RosterPlayerInfo>): Promise<TeamGraphsData> {
  const shots: PooledShot[] = [];
  const averagePositions: PooledAveragePosition[] = [];

  const withEventIds = await Promise.all(
    fixtures
      .filter((fixture) => fixture.kickoffAt)
      .map(async (fixture) => ({
        fixture,
        eventId: await findBsdEventId({ homeAbbrev: fixture.homeAbbrev, awayAbbrev: fixture.awayAbbrev, kickoffAt: fixture.kickoffAt as string }),
      }))
  );

  const resolved = withEventIds.filter((row): row is { fixture: GameweekFixture; eventId: number } => row.eventId !== null);

  const statsByFixture = await Promise.all(
    resolved.map(async ({ fixture, eventId }) => ({ fixture, stats: await fetchBsdEventStats(eventId) }))
  );

  for (const { fixture, stats } of statsByFixture) {
    for (const shot of stats.shots) {
      const player = bsdIdToPlayer.get(shot.playerId);
      if (!player) continue;

      shots.push({
        fantraxId: player.fantraxId,
        playerName: player.name,
        fixtureId: fixture.id,
        opponentAbbrev: shot.isHome ? fixture.awayAbbrev : fixture.homeAbbrev,
        isHome: shot.isHome,
        minute: shot.minute,
        type: shot.type,
        situation: shot.situation,
        body: shot.body,
        xg: shot.xg,
        x: 100 - shot.x,
        y: shot.y,
      });
    }

    for (const row of stats.averagePositions.home) {
      const player = bsdIdToPlayer.get(row.playerId);
      if (!player) continue;
      averagePositions.push({
        fantraxId: player.fantraxId,
        playerName: player.name,
        fixtureId: fixture.id,
        opponentAbbrev: fixture.awayAbbrev,
        jerseyNumber: row.jerseyNumber,
        position: row.position,
        x: row.x,
        y: 100 - row.y,
      });
    }

    for (const row of stats.averagePositions.away) {
      const player = bsdIdToPlayer.get(row.playerId);
      if (!player) continue;
      averagePositions.push({
        fantraxId: player.fantraxId,
        playerName: player.name,
        fixtureId: fixture.id,
        opponentAbbrev: fixture.homeAbbrev,
        jerseyNumber: row.jerseyNumber,
        position: row.position,
        x: row.x,
        y: 100 - row.y,
      });
    }
  }

  return { shots, averagePositions };
}
