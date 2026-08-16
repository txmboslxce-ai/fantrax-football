alter table draft_picks
  add column if not exists watchlist_order numeric;

comment on column draft_picks.watchlist_order is
  'User-defined drag order for the watchlist view only. Independent of
   custom_rank and tier_order. Null until the user drags a watchlisted player.';
