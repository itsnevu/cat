# SPHYNX Visual Key

Reference for anything visual: site, video, social, motion. Live at https://sphynxagent.xyz/visual-key/ .

## Files

- `index.html` — the full key, 8 boards. Open in a browser or use the live URL.
- `boards/board-01..08.png` — each board rendered at 1600px wide, ready to drop into Higgsfield / Figma / a deck.
- `boards/visual-key-full.png` — all boards in one tall image.
- `ref-hero.png` — screenshot of the live hero: the mood target for every clip.

## Boards

1. Identity — title, tagline, the one-paragraph description
2. Palette — every hex, light, surface, ratio (gold = yes, terracotta = no)
3. Typography — Cormorant display, Instrument Sans body, Press Start 2P labels, Space Mono data
4. Mascot — the pixel cat's four states and the do/don't
5. World — terrain, atmosphere, reflection, camera, motion, sound, plus the live hero
6. Storyboard — 30-second hero video in six frames with timecodes and VO
7. Higgsfield prompts — style block, negative, one prompt per frame
8. Formats — 16:9, 1:1, 9:16 layouts, OG, lower thirds, file pointers

## Higgsfield workflow

1. Open board 07. Copy the STYLE BLOCK and NEGATIVE once into the model settings.
2. For each frame F1–F6: use `ref-hero.png` (F1, F6) or the matching crop of `boards/board-06.png` as the image reference, paste the frame prompt, generate 5 s.
3. Keep one camera move per clip. Reject anything with daylight, blue sky, real fur, neon or text.
4. Cut in order with 8-frame dissolves. Terracotta appears only in F4.
5. Title card: Cormorant Garamond 500, letter-spaced, cream #F3E9D2 on the F6 plate; URL in Press Start 2P gold.

## Regenerate the PNGs

```sh
node scratch/boards.mjs content/visual-key/index.html content/visual-key/boards
```
(any Playwright + Chrome; the script is three lines: goto file, screenshot each `#b0N`.)
