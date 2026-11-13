---
title: Who's Watching
date: 2026-11-09
type: website
---

Find out whether anything has used your computer's camera: which apps, when, and for how long. A web page can't read your system logs by itself, so the site gives you one read-only command to paste into Terminal (Mac) or PowerShell (Windows). You paste the output back in and it becomes a timeline. It flags apps it doesn't recognise, late-night use (midnight–5am), bursts under 10 seconds, and a camera still on. Everything runs in the browser; nothing is uploaded.

**How it works**
- **Mac:** reads Control Center's `sensor-indicators` log (the same events that turn on the green dot) and pairs the `Active activity attributions changed to ["cam:…"]` lines into on/off sessions. Only the "Active" lines count, because the "Recent activity" lines repeat earlier activity.
- **Windows:** reads `CapabilityAccessManager\ConsentStore\webcam` in the registry, where Windows records each app's last start and stop time (as FILETIME). That's only the most recent use per app, not a full history.

**Learned:** on macOS, zsh has its own built-in `log` command, so a plain `log show` fails with "too many arguments". The command has to call `/usr/bin/log`. Mac logs also only go back a few days.
