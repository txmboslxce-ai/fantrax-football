import PremiumGate from "@/components/PremiumGate";
import TeamSquadClient from "@/components/portal/TeamSquadClient";
import { SEASON, mapPosition, nextFixtures, teamNameMap, type FixtureRow, type TeamRow } from "@/lib/portal/playerMetrics";
import { isPremiumUser } from "@/lib/premium";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import Link from "next/link";
import { notFound } from "next/navigation";

const BASE_TEAM_TABS = [
  { key: "overview", label: "Overview" },
  { key: "squad", label: "Squad" },
  { key: "fixtures", label: "Fixtures" },
  { key: "stats", label: "Stats" },
] as const;

type TeamTabKey = (typeof BASE_TEAM_TABS)[number]["key"] | "injuries";
type TeamPlayerRow = { id: string; name: string };
type TeamSquadPlayerRow = {
  id: string;
  name: string;
  position: string;
  ownership_pct: string | null;
};
type TeamGameweekRow = {
  player_id: string;
  gameweek: number;
  games_played: number;
  games_started?: number;
  ghost_pts?: number | string | null;
  raw_fantrax_pts: number | string | null;
};
type OpponentGameweekJoinedRow = {
  gameweek: number;
  games_started: number;
  raw_fantrax_pts: number | string | null;
  players:
    | {
        team: string;
        position: string;
      }
    | Array<{
        team: string;
        position: string;
      }>
    | null;
};
type FixtureTabRow = {
  id: string;
  gameweek: number;
  opponentAbbrev: string;
  opponentName: string;
  isHome: boolean;
  avgPerStart: number | null;
  byPosition: Record<"GK" | "DEF" | "MID" | "FWD", number | null>;
};
type MaxGameweekRow = { gameweek: number };
type TeamPlayerWithFplRow = {
  id: string;
  name: string;
  position: string;
  ownership_pct: string | null;
  fpl_player_data:
    | {
        status: string | null;
        chance_of_playing_next_round: number | null;
        news: string | null;
        news_added: string | null;
        penalties_order: number | null;
        corners_order: number | null;
        direct_freekicks_order: number | null;
      }
    | Array<{
        status: string | null;
        chance_of_playing_next_round: number | null;
        news: string | null;
        news_added: string | null;
        penalties_order: number | null;
        corners_order: number | null;
        direct_freekicks_order: number | null;
      }>
    | null;
};

type TeamFplPlayer = {
  id: string;
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  status: string | null;
  chanceOfPlaying: number | null;
  news: string | null;
  newsAdded: string | null;
  penaltiesOrder: number | null;
  cornersOrder: number | null;
  directFksOrder: number | null;
};

type TeamDetailPageProps = {
  params: Promise<{
    abbrev: string;
  }>;
  searchParams?: Promise<{
    tab?: string;
  }>;
};

function toTabKey(value: string | undefined): TeamTabKey {
  const tab = value?.toLowerCase();
  return tab === "injuries" || BASE_TEAM_TABS.some((item) => item.key === tab) ? (tab as TeamTabKey) : "overview";
}

function parseOwnership(value: string | null): number {
  if (!value) {
    return 0;
  }

  const numeric = Number.parseFloat(value.replace("%", "").trim());
  return Number.isFinite(numeric) ? numeric : 0;
}

function mixColor(a: [number, number, number], b: [number, number, number], ratio: number): string {
  const safeRatio = Math.max(0, Math.min(1, ratio));
  const r = Math.round(a[0] + (b[0] - a[0]) * safeRatio);
  const g = Math.round(a[1] + (b[1] - a[1]) * safeRatio);
  const blue = Math.round(a[2] + (b[2] - a[2]) * safeRatio);
  return `rgb(${r}, ${g}, ${blue})`;
}

function gradientCellColor(value: number, min: number, max: number): string {
  const red: [number, number, number] = [239, 68, 68];
  const yellow: [number, number, number] = [234, 179, 8];
  const green: [number, number, number] = [42, 122, 59];
  const ratio = max > min ? (value - min) / (max - min) : 0.5;
  if (ratio <= 0.5) {
    return mixColor(red, yellow, ratio * 2);
  }
  return mixColor(yellow, green, (ratio - 0.5) * 2);
}

function mapInjuryStatus(status: string | null, chance: number | null): "Injured" | "Suspended" | "Unavailable" | "Doubtful" {
  if (status === "s") {
    return "Suspended";
  }
  if (status === "u") {
    return "Unavailable";
  }
  if (status === "i") {
    return "Injured";
  }
  if (status === "d" || (status === "a" && chance != null && chance < 100)) {
    return "Doubtful";
  }
  return "Doubtful";
}

function severityRank(chance: number | null): number {
  if (chance === 0) {
    return 0;
  }
  if (chance === 25) {
    return 1;
  }
  if (chance === 50) {
    return 2;
  }
  if (chance === 75) {
    return 3;
  }
  return 4;
}

function truncateNews(news: string | null, maxLength = 60): string {
  const text = (news ?? "").trim();
  if (!text) {
    return "—";
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

export default async function TeamDetailPage({ params, searchParams }: TeamDetailPageProps) {
  const [{ abbrev }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const teamAbbrev = abbrev.toUpperCase().trim();
  const requestedTab = toTabKey(resolvedSearchParams?.tab);

  const supabase = await createServerSupabaseClient();
  const [
    {
      data: { user },
    },
    { data: teams, error: teamsError },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("teams").select("abbrev, name, full_name").order("full_name"),
  ]);

  if (teamsError) {
    throw new Error(`Unable to load teams: ${teamsError.message}`);
  }
  const team = ((teams ?? []) as TeamRow[]).find((item) => item.abbrev === teamAbbrev);
  if (!team) {
    notFound();
  }
  const teamNames = teamNameMap((teams ?? []) as TeamRow[]);

  const { data: teamPlayersWithFplData, error: teamPlayersWithFplError } = await supabase
    .from("players")
    .select(
      "id, name, position, ownership_pct, fpl_player_data(status, chance_of_playing_next_round, news, news_added, penalties_order, corners_order, direct_freekicks_order)"
    )
    .eq("team", teamAbbrev)
    .order("position", { ascending: true })
    .order("name", { ascending: true });

  if (teamPlayersWithFplError) {
    throw new Error(`Unable to load team players with FPL data: ${teamPlayersWithFplError.message}`);
  }

  const teamFplPlayers: TeamFplPlayer[] = ((teamPlayersWithFplData ?? []) as TeamPlayerWithFplRow[]).map((row) => {
    const fplRaw = Array.isArray(row.fpl_player_data) ? row.fpl_player_data[0] : row.fpl_player_data;
    return {
      id: row.id,
      name: row.name,
      position: mapPosition(row.position),
      status: fplRaw?.status ?? null,
      chanceOfPlaying: fplRaw?.chance_of_playing_next_round ?? null,
      news: fplRaw?.news ?? null,
      newsAdded: fplRaw?.news_added ?? null,
      penaltiesOrder: fplRaw?.penalties_order ?? null,
      cornersOrder: fplRaw?.corners_order ?? null,
      directFksOrder: fplRaw?.direct_freekicks_order ?? null,
    };
  });

  const hasAnyFplData = teamFplPlayers.some(
    (player) =>
      player.status != null ||
      player.chanceOfPlaying != null ||
      player.news != null ||
      player.penaltiesOrder != null ||
      player.cornersOrder != null ||
      player.directFksOrder != null
  );

  const hasAnySetPieces = hasAnyFplData
    ? teamFplPlayers.some(
        (player) => player.penaltiesOrder != null || player.cornersOrder != null || player.directFksOrder != null
      )
    : false;

  const injuriesRows = hasAnyFplData
    ? teamFplPlayers
        .filter((player) => player.status !== "a" || (player.chanceOfPlaying != null && player.chanceOfPlaying < 100))
        .sort((a, b) => {
          const severity = severityRank(a.chanceOfPlaying) - severityRank(b.chanceOfPlaying);
          if (severity !== 0) {
            return severity;
          }
          return a.name.localeCompare(b.name);
        })
    : [];

  const showInjuriesTab = injuriesRows.length > 0;
  const TEAM_TABS = showInjuriesTab ? [...BASE_TEAM_TABS, { key: "injuries", label: "Injuries" as const }] : [...BASE_TEAM_TABS];
  const activeTab: TeamTabKey = requestedTab === "injuries" && !showInjuriesTab ? "overview" : requestedTab;

  let overviewData:
    | {
        totalTeamPoints: number;
      topScorers: Array<{ id: string; name: string; points: number }>;
      concededByPosition: Record<"GK" | "DEF" | "MID" | "FWD", { perGame: number; perStart: number }>;
      upcoming: ReturnType<typeof nextFixtures>;
    }
    | undefined;
  let squadRows:
    | Array<{
        id: string;
        name: string;
        position: "GK" | "DEF" | "MID" | "FWD";
        seasonPts: number;
        avgPtsPerGw: number;
        avgPtsPerGame: number;
        ghostPtsPerGw: number;
        ownershipPct: number;
      }>
    | undefined;
  let fixturesRows: FixtureTabRow[] | undefined;

  if (activeTab === "overview") {
    const { data: teamPlayers, error: playersError } = await supabase
      .from("players")
      .select("id, name")
      .eq("team", teamAbbrev)
      .order("name");
    if (playersError) {
      throw new Error(`Unable to load team players: ${playersError.message}`);
    }

    const playerRows = (teamPlayers ?? []) as TeamPlayerRow[];
    const playerIds = playerRows.map((player) => player.id);

    const [{ data: gameweeks, error: gameweeksError }, { data: fixtures, error: fixturesError }] = await Promise.all([
      playerIds.length
        ? supabase
            .from("player_gameweeks")
            .select("player_id, gameweek, games_played, raw_fantrax_pts")
            .eq("season", SEASON)
            .in("player_id", playerIds)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("fixtures").select("id, season, gameweek, home_team, away_team").eq("season", SEASON),
    ]);

    if (gameweeksError) {
      throw new Error(`Unable to load player gameweeks: ${gameweeksError.message}`);
    }
    if (fixturesError) {
      throw new Error(`Unable to load fixtures: ${fixturesError.message}`);
    }

    const pointsByPlayer = new Map(playerRows.map((player) => [player.id, 0]));
    let totalTeamPoints = 0;
    let currentGameweek = 0;

    for (const row of (gameweeks ?? []) as TeamGameweekRow[]) {
      if (Number(row.games_played ?? 0) <= 0) {
        continue;
      }

      const rowPoints = Number(row.raw_fantrax_pts ?? 0);
      totalTeamPoints += rowPoints;
      currentGameweek = Math.max(currentGameweek, Number(row.gameweek ?? 0));
      pointsByPlayer.set(row.player_id, (pointsByPlayer.get(row.player_id) ?? 0) + rowPoints);
    }

    const topScorers = playerRows
      .map((player) => ({
        id: player.id,
        name: player.name,
        points: pointsByPlayer.get(player.id) ?? 0,
      }))
      .sort((a, b) => b.points - a.points)
      .slice(0, 3);

    const fixturesForTeamPlayed = ((fixtures ?? []) as FixtureRow[]).filter(
      (fixture) => fixture.gameweek <= currentGameweek && (fixture.home_team === teamAbbrev || fixture.away_team === teamAbbrev)
    );

    let concededByPosition: Record<"GK" | "DEF" | "MID" | "FWD", { perGame: number; perStart: number }> = {
      GK: { perGame: 0, perStart: 0 },
      DEF: { perGame: 0, perStart: 0 },
      MID: { perGame: 0, perStart: 0 },
      FWD: { perGame: 0, perStart: 0 },
    };

    const playedGameweeks = Array.from(new Set(fixturesForTeamPlayed.map((fixture) => fixture.gameweek)));
    if (playedGameweeks.length > 0) {
      const { data: opponentGameweeks, error: opponentGameweeksError } = await supabase
        .from("player_gameweeks")
        .select("gameweek, games_started, raw_fantrax_pts, players!inner(team, position)")
        .eq("season", SEASON)
        .gt("games_played", 0)
        .in("gameweek", playedGameweeks);
      if (opponentGameweeksError) {
        throw new Error(`Unable to load opponent player gameweeks: ${opponentGameweeksError.message}`);
      }

      const totalsByPosition: Record<"GK" | "DEF" | "MID" | "FWD", number> = {
        GK: 0,
        DEF: 0,
        MID: 0,
        FWD: 0,
      };
      const startedTotalsByPosition: Record<"GK" | "DEF" | "MID" | "FWD", number> = {
        GK: 0,
        DEF: 0,
        MID: 0,
        FWD: 0,
      };
      const startedCountByPosition: Record<"GK" | "DEF" | "MID" | "FWD", number> = {
        GK: 0,
        DEF: 0,
        MID: 0,
        FWD: 0,
      };

      for (const row of (opponentGameweeks ?? []) as OpponentGameweekJoinedRow[]) {
        const player = Array.isArray(row.players) ? row.players[0] : row.players;
        if (!player || player.team === teamAbbrev) {
          continue;
        }

        const matchesFixtureJoin = fixturesForTeamPlayed.some(
          (fixture) =>
            fixture.gameweek === Number(row.gameweek ?? 0) &&
            ((fixture.home_team === teamAbbrev && fixture.away_team === player.team) ||
              (fixture.away_team === teamAbbrev && fixture.home_team === player.team))
        );
        if (!matchesFixtureJoin) {
          continue;
        }

        const position = mapPosition(player.position);
        const rowPoints = Number(row.raw_fantrax_pts ?? 0);
        totalsByPosition[position] += rowPoints;
        if (Number(row.games_started ?? 0) >= 1) {
          startedTotalsByPosition[position] += rowPoints;
          startedCountByPosition[position] += 1;
        }
      }

      const distinctGameweeks = new Set(fixturesForTeamPlayed.map((fixture) => fixture.gameweek)).size;
      concededByPosition = {
        GK: {
          perGame: distinctGameweeks > 0 ? totalsByPosition.GK / distinctGameweeks : 0,
          perStart: startedCountByPosition.GK > 0 ? startedTotalsByPosition.GK / startedCountByPosition.GK : 0,
        },
        DEF: {
          perGame: distinctGameweeks > 0 ? totalsByPosition.DEF / distinctGameweeks : 0,
          perStart: startedCountByPosition.DEF > 0 ? startedTotalsByPosition.DEF / startedCountByPosition.DEF : 0,
        },
        MID: {
          perGame: distinctGameweeks > 0 ? totalsByPosition.MID / distinctGameweeks : 0,
          perStart: startedCountByPosition.MID > 0 ? startedTotalsByPosition.MID / startedCountByPosition.MID : 0,
        },
        FWD: {
          perGame: distinctGameweeks > 0 ? totalsByPosition.FWD / distinctGameweeks : 0,
          perStart: startedCountByPosition.FWD > 0 ? startedTotalsByPosition.FWD / startedCountByPosition.FWD : 0,
        },
      };
    }

    const upcoming = nextFixtures(teamAbbrev, (fixtures ?? []) as FixtureRow[], currentGameweek, teamNames, 5);
    overviewData = { totalTeamPoints, topScorers, concededByPosition, upcoming };
  }

  if (activeTab === "squad") {
    const { data: players, error: playersError } = await supabase
      .from("players")
      .select("id, name, position, ownership_pct")
      .eq("team", teamAbbrev)
      .order("name");
    if (playersError) {
      throw new Error(`Unable to load squad players: ${playersError.message}`);
    }

    const squadPlayers = (players ?? []) as TeamSquadPlayerRow[];
    const playerIds = squadPlayers.map((player) => player.id);

    const { data: playerGameweeks, error: gameweeksError } = playerIds.length
      ? await supabase
          .from("player_gameweeks")
          .select("player_id, games_played, raw_fantrax_pts, ghost_pts")
          .eq("season", SEASON)
          .in("player_id", playerIds)
      : { data: [], error: null };
    if (gameweeksError) {
      throw new Error(`Unable to load squad player gameweeks: ${gameweeksError.message}`);
    }

    const statsByPlayer = new Map<
      string,
      {
        seasonPts: number;
        ghostPts: number;
        gameweeksPlayed: number;
        totalGamesPlayed: number;
      }
    >();

    for (const row of (playerGameweeks ?? []) as TeamGameweekRow[]) {
      if (Number(row.games_played ?? 0) <= 0) {
        continue;
      }

      const existing = statsByPlayer.get(row.player_id);
      if (!existing) {
        statsByPlayer.set(row.player_id, {
          seasonPts: Number(row.raw_fantrax_pts ?? 0),
          ghostPts: Number(row.ghost_pts ?? 0),
          gameweeksPlayed: 1,
          totalGamesPlayed: Number(row.games_played ?? 0),
        });
        continue;
      }

      existing.seasonPts += Number(row.raw_fantrax_pts ?? 0);
      existing.ghostPts += Number(row.ghost_pts ?? 0);
      existing.gameweeksPlayed += 1;
      existing.totalGamesPlayed += Number(row.games_played ?? 0);
    }

    squadRows = squadPlayers
      .map((player) => {
        const totals = statsByPlayer.get(player.id);
        const seasonPts = totals?.seasonPts ?? 0;
        const gameweeksPlayed = totals?.gameweeksPlayed ?? 0;
        const totalGamesPlayed = totals?.totalGamesPlayed ?? 0;
        const ghostPts = totals?.ghostPts ?? 0;

        return {
          id: player.id,
          name: player.name,
          position: mapPosition(player.position),
          seasonPts,
          avgPtsPerGw: gameweeksPlayed > 0 ? seasonPts / gameweeksPlayed : 0,
          avgPtsPerGame: totalGamesPlayed > 0 ? seasonPts / totalGamesPlayed : 0,
          ghostPtsPerGw: gameweeksPlayed > 0 ? ghostPts / gameweeksPlayed : 0,
          ownershipPct: parseOwnership(player.ownership_pct),
        };
      })
      .sort((a, b) => b.seasonPts - a.seasonPts);
  }

  if (activeTab === "fixtures") {
    const { data: teamPlayers, error: teamPlayersError } = await supabase.from("players").select("id").eq("team", teamAbbrev);
    if (teamPlayersError) {
      throw new Error(`Unable to load team players: ${teamPlayersError.message}`);
    }
    const teamPlayerIds = (teamPlayers ?? []).map((row) => row.id);

    let latestUploadedGw = 0;
    if (teamPlayerIds.length > 0) {
      const { data: latestRows, error: latestGwError } = await supabase
        .from("player_gameweeks")
        .select("gameweek")
        .eq("season", SEASON)
        .in("player_id", teamPlayerIds)
        .order("gameweek", { ascending: false })
        .limit(1);
      if (latestGwError) {
        throw new Error(`Unable to load latest uploaded gameweek: ${latestGwError.message}`);
      }
      latestUploadedGw = ((latestRows ?? []) as MaxGameweekRow[])[0]?.gameweek ?? 0;
    }

    const [
      { data: fixtures, error: fixturesError },
      { data: allUploadedFixtures, error: allUploadedFixturesError },
    ] = await Promise.all([
      supabase
        .from("fixtures")
        .select("id, season, gameweek, home_team, away_team")
        .eq("season", SEASON)
        .or(`home_team.eq.${teamAbbrev},away_team.eq.${teamAbbrev}`)
        .order("gameweek", { ascending: true }),
      supabase.from("fixtures").select("id, season, gameweek, home_team, away_team").eq("season", SEASON).lte("gameweek", latestUploadedGw),
    ]);
    if (fixturesError) {
      throw new Error(`Unable to load fixtures: ${fixturesError.message}`);
    }
    if (allUploadedFixturesError) {
      throw new Error(`Unable to load uploaded fixtures: ${allUploadedFixturesError.message}`);
    }

    const teamFixtures = ((fixtures ?? []) as FixtureRow[]).filter((fixture) => fixture.gameweek > latestUploadedGw);
    const upcomingOpponents = Array.from(
      new Set(teamFixtures.map((fixture) => (fixture.home_team === teamAbbrev ? fixture.away_team : fixture.home_team)))
    );
    const opponentFixtures = ((allUploadedFixtures ?? []) as FixtureRow[]).filter(
      (fixture) => upcomingOpponents.includes(fixture.home_team) || upcomingOpponents.includes(fixture.away_team)
    );
    const fixtureGameweeks = Array.from(new Set(opponentFixtures.map((fixture) => fixture.gameweek)));

    const fixtureAggByGwAndOpponent = new Map<
      string,
      {
        totalPoints: number;
        totalStarts: number;
        byPosition: Record<"GK" | "DEF" | "MID" | "FWD", { points: number; starts: number }>;
      }
    >();

    for (const opponent of upcomingOpponents) {
      fixtureAggByGwAndOpponent.set(opponent, {
        totalPoints: 0,
        totalStarts: 0,
        byPosition: {
          GK: { points: 0, starts: 0 },
          DEF: { points: 0, starts: 0 },
          MID: { points: 0, starts: 0 },
          FWD: { points: 0, starts: 0 },
        },
      });
    }

    const opponentsByGwAndTeam = new Map<string, string[]>();
    for (const fixture of opponentFixtures) {
      if (upcomingOpponents.includes(fixture.home_team)) {
        const key = `${fixture.gameweek}:${fixture.away_team}`;
        const existing = opponentsByGwAndTeam.get(key) ?? [];
        existing.push(fixture.home_team);
        opponentsByGwAndTeam.set(key, existing);
      }
      if (upcomingOpponents.includes(fixture.away_team)) {
        const key = `${fixture.gameweek}:${fixture.home_team}`;
        const existing = opponentsByGwAndTeam.get(key) ?? [];
        existing.push(fixture.away_team);
        opponentsByGwAndTeam.set(key, existing);
      }
    }

    if (fixtureGameweeks.length > 0) {
      const { data: opponentGameweeks, error: opponentGameweeksError } = await supabase
        .from("player_gameweeks")
        .select("gameweek, games_started, raw_fantrax_pts, players!inner(team, position)")
        .eq("season", SEASON)
        .gt("games_played", 0)
        .in("gameweek", fixtureGameweeks);
      if (opponentGameweeksError) {
        throw new Error(`Unable to load opponent player gameweeks: ${opponentGameweeksError.message}`);
      }

      for (const row of (opponentGameweeks ?? []) as OpponentGameweekJoinedRow[]) {
        const player = Array.isArray(row.players) ? row.players[0] : row.players;
        if (!player || Number(row.games_started ?? 0) < 1) {
          continue;
        }

        const opponentKeys = opponentsByGwAndTeam.get(`${Number(row.gameweek ?? 0)}:${player.team}`) ?? [];
        if (opponentKeys.length === 0) {
          continue;
        }

        const points = Number(row.raw_fantrax_pts ?? 0);
        const position = mapPosition(player.position);
        for (const opponent of opponentKeys) {
          const aggregate = fixtureAggByGwAndOpponent.get(opponent);
          if (!aggregate) {
            continue;
          }
          aggregate.totalPoints += points;
          aggregate.totalStarts += 1;
          aggregate.byPosition[position].points += points;
          aggregate.byPosition[position].starts += 1;
        }
      }
    }

    fixturesRows = teamFixtures.map((fixture) => {
      const opponentCode = fixture.home_team === teamAbbrev ? fixture.away_team : fixture.home_team;
      const aggregate = fixtureAggByGwAndOpponent.get(opponentCode);
      const avgPerStart = aggregate && aggregate.totalStarts > 0 ? aggregate.totalPoints / aggregate.totalStarts : null;

      const byPosition: FixtureTabRow["byPosition"] = {
        GK: aggregate && aggregate.byPosition.GK.starts > 0 ? aggregate.byPosition.GK.points / aggregate.byPosition.GK.starts : null,
        DEF: aggregate && aggregate.byPosition.DEF.starts > 0 ? aggregate.byPosition.DEF.points / aggregate.byPosition.DEF.starts : null,
        MID: aggregate && aggregate.byPosition.MID.starts > 0 ? aggregate.byPosition.MID.points / aggregate.byPosition.MID.starts : null,
        FWD: aggregate && aggregate.byPosition.FWD.starts > 0 ? aggregate.byPosition.FWD.points / aggregate.byPosition.FWD.starts : null,
      };

      return {
        id: fixture.id,
        gameweek: fixture.gameweek,
        opponentAbbrev: opponentCode,
        opponentName: teamNames.get(opponentCode) ?? opponentCode,
        isHome: fixture.home_team === teamAbbrev,
        avgPerStart,
        byPosition,
      };
    });
  }

  const panelContent: Record<Exclude<TeamTabKey, "overview" | "injuries">, { title: string; description: string }> = {
    squad: {
      title: "Squad",
      description: "Squad depth, player roles, and position breakdowns will appear here.",
    },
    fixtures: {
      title: "Fixtures",
      description: "Upcoming fixture runs and difficulty views will appear here.",
    },
    stats: {
      title: "Stats",
      description: "Team-level performance metrics and splits will appear here.",
    },
  };
  const hasPremiumAccess = await isPremiumUser(user?.id);

  return (
    <PremiumGate isPremium={hasPremiumAccess}>
      <div className="space-y-6">
        <header className="rounded-xl border border-brand-cream/20 bg-brand-dark px-5 py-4">
          <p className="text-xs uppercase tracking-widest text-brand-creamDark">{team.abbrev}</p>
          <h1 className="mt-1 text-3xl font-black text-brand-cream sm:text-4xl">{team.full_name}</h1>
        </header>

        <nav className="flex flex-wrap gap-2">
          {TEAM_TABS.map((tab) => (
            <Link
              key={tab.key}
              href={`/portal/teams/${encodeURIComponent(team.abbrev.toLowerCase())}?tab=${tab.key}`}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === tab.key
                  ? "border-brand-greenLight bg-brand-green text-brand-cream"
                  : "border-brand-cream/35 bg-brand-dark text-brand-cream hover:bg-brand-greenDark"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        <section className="rounded-xl border border-brand-cream/20 bg-brand-dark/70 p-6 text-brand-cream">
          {activeTab === "overview" ? (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <article className="rounded-xl border border-brand-cream/20 bg-brand-green/20 p-5">
                  <p className="text-xs uppercase tracking-wide text-brand-creamDark">Team Total Points</p>
                  <p className="mt-2 text-3xl font-black">{(overviewData?.totalTeamPoints ?? 0).toFixed(2)}</p>
                  <p className="mt-1 text-xs text-brand-creamDark">Season {SEASON}</p>
                </article>

                {(overviewData?.topScorers ?? []).map((player, index) => (
                  <article key={player.id} className="rounded-xl border border-brand-cream/20 bg-brand-dark p-5">
                    <p className="text-xs uppercase tracking-wide text-brand-creamDark">Top Scorer #{index + 1}</p>
                    <p className="mt-2 text-lg font-black">{player.name}</p>
                    <p className="mt-1 text-sm text-brand-creamDark">{player.points.toFixed(2)} pts</p>
                  </article>
                ))}
              </div>

              {hasAnySetPieces ? (
                <div className="space-y-3">
                  <h2 className="text-2xl font-black">Set Piece Takers</h2>
                  <article className="rounded-xl border border-brand-cream/20 bg-brand-dark p-4">
                    {(() => {
                      const sections = [
                        {
                          label: "Penalties",
                          rows: teamFplPlayers
                            .filter((player) => player.penaltiesOrder != null)
                            .sort((a, b) => Number(a.penaltiesOrder ?? 999) - Number(b.penaltiesOrder ?? 999))
                            .map((player) => ({ order: player.penaltiesOrder as number, player })),
                        },
                        {
                          label: "Corners & Indirect Free Kicks",
                          rows: teamFplPlayers
                            .filter((player) => player.cornersOrder != null)
                            .sort((a, b) => Number(a.cornersOrder ?? 999) - Number(b.cornersOrder ?? 999))
                            .map((player) => ({ order: player.cornersOrder as number, player })),
                        },
                        {
                          label: "Direct Free Kicks",
                          rows: teamFplPlayers
                            .filter((player) => player.directFksOrder != null)
                            .sort((a, b) => Number(a.directFksOrder ?? 999) - Number(b.directFksOrder ?? 999))
                            .map((player) => ({ order: player.directFksOrder as number, player })),
                        },
                      ].filter((section) => section.rows.length > 0);

                      return (
                        <div className="space-y-3">
                          {sections.map((section) => (
                            <div key={section.label} className="space-y-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-brand-creamDark">{section.label}</p>
                              <div className="flex flex-wrap gap-2">
                                {section.rows.map((entry) => (
                                  <span
                                    key={`${section.label}-${entry.player.id}-${entry.order}`}
                                    className="inline-flex items-center gap-2 rounded-full border border-amber-300/35 bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-100"
                                  >
                                    <span>#{entry.order}</span>
                                    <span>{entry.player.name}</span>
                                    <span className="inline-flex rounded-full border border-brand-cream/30 bg-brand-dark px-2 py-0.5 text-[11px] text-brand-cream">
                                      {entry.player.position}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </article>
                </div>
              ) : null}

              <div className="space-y-3">
                <h2 className="text-2xl font-black">Points Conceded by Position</h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {(["GK", "DEF", "MID", "FWD"] as const).map((position) => (
                    <article key={position} className="rounded-xl border border-brand-cream/20 bg-brand-dark p-4">
                      <p className="text-xs uppercase tracking-wider text-brand-creamDark">{position}</p>
                      <p className="mt-2 text-2xl font-black">{(overviewData?.concededByPosition[position].perGame ?? 0).toFixed(2)}</p>
                      <p className="mt-1 text-xs text-brand-creamDark">Avg pts conceded / game</p>
                      <p className="mt-3 text-xl font-black">{(overviewData?.concededByPosition[position].perStart ?? 0).toFixed(2)}</p>
                      <p className="mt-1 text-xs text-brand-creamDark">Avg pts conceded / start</p>
                    </article>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-2xl font-black">Next 5 Fixtures</h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  {(overviewData?.upcoming ?? []).map((fixture) => (
                    <article key={fixture.id} className="rounded-xl border border-brand-cream/20 bg-brand-greenDark p-4 text-brand-cream">
                      <p className="text-xs uppercase tracking-wider text-brand-creamDark">GW {fixture.gameweek}</p>
                      <p className="mt-2 font-bold">{fixture.opponentName}</p>
                      <p className="mt-1 text-sm">{fixture.isHome ? "H" : "A"}</p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          ) : activeTab === "squad" ? (
            <div className="space-y-3">
              <h2 className="text-2xl font-black">Squad</h2>
              <TeamSquadClient players={squadRows ?? []} />
            </div>
          ) : activeTab === "fixtures" ? (
            <div className="space-y-3">
              <h2 className="text-2xl font-black">Fixtures</h2>
              {(() => {
                const rows = fixturesRows ?? [];
                const rangeFor = (values: Array<number | null>) => {
                  const numeric = values.filter((value): value is number => value != null);
                  return {
                    min: numeric.length > 0 ? Math.min(...numeric) : 0,
                    max: numeric.length > 0 ? Math.max(...numeric) : 0,
                  };
                };

                const ranges = {
                  overall: rangeFor(rows.map((row) => row.avgPerStart)),
                  GK: rangeFor(rows.map((row) => row.byPosition.GK)),
                  DEF: rangeFor(rows.map((row) => row.byPosition.DEF)),
                  MID: rangeFor(rows.map((row) => row.byPosition.MID)),
                  FWD: rangeFor(rows.map((row) => row.byPosition.FWD)),
                };

                const leftGw = 0;
                const leftOpponent = 72;
                const leftHa = 312;

                return (
                  <div className="overflow-x-auto rounded-xl border border-brand-cream/20">
                    <table className="min-w-[980px] text-left text-sm">
                      <thead className="text-brand-creamDark">
                        <tr>
                          <th
                            className="sticky left-0 top-0 z-30 border-b border-r border-brand-cream/25 bg-[#0F1F13] px-4 py-3 font-semibold"
                            style={{ left: leftGw, minWidth: 72 }}
                          >
                            GW
                          </th>
                          <th
                            className="sticky top-0 z-30 border-b border-r border-brand-cream/25 bg-[#0F1F13] px-4 py-3 font-semibold"
                            style={{ left: leftOpponent, minWidth: 240 }}
                          >
                            Opponent
                          </th>
                          <th
                            className="sticky top-0 z-30 border-b border-r border-brand-cream/25 bg-[#0F1F13] px-4 py-3 font-semibold"
                            style={{ left: leftHa, minWidth: 72 }}
                          >
                            H/A
                          </th>
                          <th className="sticky top-0 z-20 border-b border-r border-brand-cream/25 bg-brand-dark px-4 py-3 font-semibold">
                            Avg/Start
                          </th>
                          <th className="sticky top-0 z-20 border-b border-r border-brand-cream/25 bg-brand-dark px-4 py-3 font-semibold">GK</th>
                          <th className="sticky top-0 z-20 border-b border-r border-brand-cream/25 bg-brand-dark px-4 py-3 font-semibold">DEF</th>
                          <th className="sticky top-0 z-20 border-b border-r border-brand-cream/25 bg-brand-dark px-4 py-3 font-semibold">MID</th>
                          <th className="sticky top-0 z-20 border-b border-brand-cream/25 bg-brand-dark px-4 py-3 font-semibold">FWD</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, index) => {
                          const rowBg = index % 2 === 0 ? "bg-brand-dark/75" : "bg-brand-dark";

                          const statCell = (value: number | null, min: number, max: number) => {
                            if (value == null) {
                              return <span className="text-brand-creamDark">-</span>;
                            }
                            return (
                              <span
                                className="inline-block min-w-14 rounded px-2 py-1 text-center font-semibold text-[#0f1f13]"
                                style={{ backgroundColor: gradientCellColor(value, min, max) }}
                              >
                                {value.toFixed(2)}
                              </span>
                            );
                          };

                          return (
                            <tr key={row.id} className={`${rowBg} text-brand-cream`}>
                              <td
                                className={`sticky z-20 border-b border-r border-brand-cream/10 px-4 py-3 font-semibold ${rowBg}`}
                                style={{ left: leftGw, minWidth: 72 }}
                              >
                                {row.gameweek}
                              </td>
                              <td className={`sticky z-20 border-b border-r border-brand-cream/10 px-4 py-3 ${rowBg}`} style={{ left: leftOpponent, minWidth: 240 }}>
                                <Link
                                  href={`/portal/teams/${encodeURIComponent(row.opponentAbbrev.toLowerCase())}`}
                                  className="font-semibold hover:text-brand-greenLight"
                                >
                                  {row.opponentName}
                                </Link>
                              </td>
                              <td className={`sticky z-20 border-b border-r border-brand-cream/10 px-4 py-3 ${rowBg}`} style={{ left: leftHa, minWidth: 72 }}>
                                {row.isHome ? "H" : "A"}
                              </td>
                              <td className="border-b border-r border-brand-cream/10 px-4 py-3">{statCell(row.avgPerStart, ranges.overall.min, ranges.overall.max)}</td>
                              <td className="border-b border-r border-brand-cream/10 px-4 py-3">{statCell(row.byPosition.GK, ranges.GK.min, ranges.GK.max)}</td>
                              <td className="border-b border-r border-brand-cream/10 px-4 py-3">{statCell(row.byPosition.DEF, ranges.DEF.min, ranges.DEF.max)}</td>
                              <td className="border-b border-r border-brand-cream/10 px-4 py-3">{statCell(row.byPosition.MID, ranges.MID.min, ranges.MID.max)}</td>
                              <td className="border-b border-brand-cream/10 px-4 py-3">{statCell(row.byPosition.FWD, ranges.FWD.min, ranges.FWD.max)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          ) : activeTab === "injuries" ? (
            <div className="space-y-3">
              <h2 className="text-2xl font-black">Injuries</h2>
              {injuriesRows.length === 0 ? (
                <p className="text-sm text-brand-creamDark">No injury concerns for this team.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-brand-cream/20">
                  <table className="min-w-full text-left text-sm text-brand-cream">
                    <thead className="bg-brand-dark text-brand-creamDark">
                      <tr>
                        <th className="px-4 py-3">Player</th>
                        <th className="px-4 py-3">Position</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Chance of Playing</th>
                        <th className="px-4 py-3">News</th>
                      </tr>
                    </thead>
                    <tbody>
                      {injuriesRows.map((row, index) => {
                        const statusLabel = mapInjuryStatus(row.status, row.chanceOfPlaying);
                        const statusPillClass =
                          statusLabel === "Doubtful"
                            ? "border-amber-300/35 bg-amber-500/20 text-amber-100"
                            : "border-red-300/35 bg-red-500/20 text-red-100";

                        return (
                          <tr key={row.id} className={index % 2 === 0 ? "bg-brand-dark/75" : "bg-brand-dark/90"}>
                            <td className="px-4 py-3 font-semibold">
                              {row.id ? (
                                <Link href={`/portal/players/${row.id}`} className="hover:text-brand-greenLight">
                                  {row.name}
                                </Link>
                              ) : (
                                row.name
                              )}
                            </td>
                            <td className="px-4 py-3">{row.position}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusPillClass}`}>
                                {statusLabel}
                              </span>
                            </td>
                            <td className="px-4 py-3">{row.chanceOfPlaying == null ? "—" : `${row.chanceOfPlaying}%`}</td>
                            <td className="px-4 py-3" title={(row.news ?? "").trim() || undefined}>
                              {truncateNews(row.news)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <>
              <h2 className="text-xl font-black">{panelContent[activeTab].title}</h2>
              <p className="mt-2 text-sm text-brand-creamDark">{panelContent[activeTab].description}</p>
            </>
          )}
        </section>
      </div>
    </PremiumGate>
  );
}
