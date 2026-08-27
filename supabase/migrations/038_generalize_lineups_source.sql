-- The 012 migration built sofascore_lineups for a Sofascore-based lineup
-- sync that never shipped -- Sofascore's API blocks the cloud IPs this app
-- runs from, so that source is a dead end. No app code references this
-- table yet, so it's safe to repurpose in place rather than leave it
-- orphaned: rename it to a source-agnostic name and swap the numeric
-- Sofascore event id for a free-text one so any scrapeable source (starting
-- with RotoWire) can populate it the same way.
alter table sofascore_lineups rename to player_lineups;
alter table player_lineups rename column sofascore_event_id to source_event_id;
alter table player_lineups alter column source_event_id type text using source_event_id::text;
alter table player_lineups add column if not exists source text not null default 'rotowire';
