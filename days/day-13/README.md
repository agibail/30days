---
title: Bored or Busy
date: 2026-11-11
type: website
---

An add-on idea for friend-location maps: besides *where* your friends are, you can see whether they're up for something. Set yourself to **Bored** (open to hang) and your pin gets a pulsing **yellow** ring. Set yourself to **Busy** and it gets a **purple** ring. **Hidden** shows no ring.

- Add a short note ("down for coffee") and pick how long the status lasts (1, 2 or 4 hours, or until you change it).
- The friend list puts bored friends first. **Only bored** dims everyone else and zooms to fit the bored ones.
- **Wave 👋** at a bored friend.
- The friends are simulated. They drift around and sometimes change status, and you get a toast when someone becomes bored. If you allow location, the map centres on you.

**Tools:** Leaflet with Esri street tiles (no API key). Your status is saved in your browser (localStorage).

**What I'd add next:** real accounts and shared status (something like Supabase realtime), push notifications when a close friend turns yellow, and a "who's bored near me" radius.
