-- RotoWire's Injuries footnote (OUT/QUES/etc per player) was previously
-- discarded entirely during parsing. Storing it lets the predicted-lineups
-- pitch show each team's injury notes instead of just their starting XI.
alter table player_lineups add column if not exists injury_status text;
