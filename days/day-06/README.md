---
title: Mani Machine
date: 2026-11-04
type: website
---

Design your nails on a photo of your own hands. [Open it](days/day-06/site/index.html)

- Upload, drop or paste a photo of your hands (backs to the camera, fingers spread). A hand-tracking model (MediaPipe Hand Landmarker) finds all ten fingertips and places a nail on each.
- **Uses only my hands** (`media/hands.png`, shot on a white background), nails always bare. There's no upload and no before/after button.
- **Only your hands.** Everything else (you, the room, the background) is cut away automatically. The hand landmarks give a rough hand shape, and MediaPipe's multiclass selfie segmenter, run on a close crop of each hand, keeps only body skin (not face, hair or clothes). Wrists fade out softly. On a plain background (like my white wall) it just keys out that colour, so whole arms stay and the edges come out clean; specks are dropped and arms fade at the bottom. A PNG that is already cut out is used as is. The saved photo is the cut-out, never the original.
- **Bare nails every time.** Whatever polish is in the photo gets covered with a soft patch in your own skin tone (sampled just behind each cuticle), then a fresh natural nail is drawn on top: pink bed, lunula, white free edge, a little shine. Your designs are never saved, so every visit starts bare. Only the photo and where your nails sit are remembered (in your browser).
- **Grow and cut:** Grow / ✂ Cut buttons (the clipping falls off), a length slider, or drag the red ✂ handle in *Fit nails* mode.
- **Shape:** square, squoval, round, oval, almond, stiletto, coffin. Short nails shaped stiletto round off, the way they would in real life.
- **Paint:** 21 polish bottles plus any colour, *Paint nail*, *French tip*, brush, dots, gems and an eraser. Draw on the big zoomed nail or right on the photo. Finishes: gloss, matte, jelly, chrome, glitter.
- Shape, length, paint and finish go on all nails or just this one (accent nail). *Copy design to all* copies the art across.
- *Fit nails* fixes anything the finder got wrong: drag a nail onto your real one, or use the handles on the big nail for cuticle, bed length and width. *Add nail* draws one in from cuticle to fingertip.
- *Hold: original* shows the photo as it really is. *Download PNG* saves the hands on a transparent background.

Each nail is its own little coordinate system (100 units wide, cuticle at 0), so a design is drawn once and fits any finger, and cutting a nail really cuts the art.
