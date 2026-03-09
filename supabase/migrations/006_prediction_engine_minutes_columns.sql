alter table player_predictions
  add column if not exists expected_minutes_if_start numeric(5,2),
  add column if not exists expected_minutes_if_bench numeric(5,2);
