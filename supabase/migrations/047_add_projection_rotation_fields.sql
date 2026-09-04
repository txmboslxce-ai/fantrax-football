-- Rotation/injury-aware projections: see lib/projections/playerProjection.ts.
-- is_predicted_starter is nullable -- null means RotoWire had no lineup
-- prediction yet for this player's team when the projection was computed,
-- not "confirmed not starting".
alter table player_projections
  add column if not exists is_predicted_starter boolean,
  add column if not exists injury_status text,
  add column if not exists projected_score_if_starting numeric(6, 2);
