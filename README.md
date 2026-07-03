# Poetry for Neanderthals 🦴

The Game of Big Words and Small Brains — a single-screen party game. Get your
team to guess the secret word or phrase using only one-syllable clue words.
Slip up and say a big word? Tap **CLUBBED!**

## How to Play

1. Add your teams (2-6), pick a round length and how many turns per team.
2. Choose which word piles (categories) are in play.
3. Pass the device to the clue-giver each turn. They see the secret word and
   describe it out loud using only single-syllable words.
4. Teammates guess out loud. Tap:
   - **✅ Got It!** — correct guess, +1 point, next card.
   - **⏭ Skip** — no points, next card.
   - **🦴 CLUBBED!** — the clue-giver used a big word, −1 point, next card.
5. When the timer hits zero the turn ends. Highest total score when everyone
   has had their turns wins!

## Running locally

This is a static site with no build step — just open `index.html` in a
browser, or serve it locally:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deployment

Pushing to `main` automatically deploys the site to GitHub Pages via the
workflow in `.github/workflows/deploy.yml`. Enable Pages for this repo under
**Settings → Pages → Source: GitHub Actions** and the game will be live at
`https://<owner>.github.io/<repo>/`.
