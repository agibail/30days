---
title: X Marks the Spot
date: 2026-11-07
type: website
---

A satellite map of places people have had sex, each pinned with an anonymous story about how they ended up there. Drop coordinates (paste `lat, lng`, a Google Maps link, click the map, or use your location) and the spot comes back as a satellite photo with a red X, plus links to open it in Google Earth and Google Maps.

**Tools:** Leaflet, Esri World Imagery (free satellite tiles and static image export, no API key), Supabase for shared storage.

**Privacy:** posts are anonymous, there's an 18+ gate, a consent checkbox, and an optional "blur my location by ~150m" toggle.

## Connecting Supabase (shared pins)

Until this is set up the site runs in **local mode**: everyone sees four example pins, and your own submissions are saved only in your browser.

1. Create a free project at supabase.com.
2. Open **SQL Editor** and run:

```sql
create table pins (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  place text not null check (char_length(place) between 1 and 60),
  title text not null check (char_length(title) between 1 and 80),
  story text not null check (char_length(story) between 20 and 2000),
  hidden boolean not null default false
);
alter table pins enable row level security;
create policy "read visible" on pins for select using (hidden = false);
create policy "anyone can post" on pins for insert with check (hidden = false);
```

3. **Project Settings → API**: copy the Project URL and the `anon` public key into `SUPABASE_URL` / `SUPABASE_KEY` near the bottom of `site/index.html`. The anon key is meant to be public; the policies above only let visitors read visible pins and add new ones (no edits or deletes).
4. To take a post down: in the Table Editor set its `hidden` to `true`.
