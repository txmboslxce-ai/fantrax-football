CREATE TABLE sofascore_lineups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid REFERENCES players(id) ON DELETE CASCADE,
  season text NOT NULL,
  gameweek integer NOT NULL,
  sofascore_event_id integer NOT NULL,
  status text NOT NULL CHECK (status IN ('predicted', 'confirmed')),
  is_starter boolean NOT NULL,
  fetched_at timestamptz DEFAULT now(),
  UNIQUE(player_id, season, gameweek)
);

CREATE INDEX ON sofascore_lineups(season, gameweek);
CREATE INDEX ON sofascore_lineups(player_id);

ALTER TABLE player_predictions ADD COLUMN IF NOT EXISTS sofascore_source text;
