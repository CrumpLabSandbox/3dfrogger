# 3D Frog Crossing Game

> A Frogger-style game reimagined in three dimensions: the frog explodes if it gets hit, and if it survives the crossing it saves the princess.

- **Status:** playable prototype
- **Tags:** game, fun
- **Play it:** https://crumplabsandbox.github.io/3dfrogger/ (deployed from `main` by GitHub Actions)
- **Captured:** 2026-10-11
- **Source:** the `frog-crossing-3d` idea in the [Idea Console](https://github.com/CrumpLab/IdeaConsole/tree/main/ideas/frog-crossing-3d) (raw record: [`docs/idea.json`](docs/idea.json))

## Playing

The prototype is called **Ribbit Rescue** (a working name, since Frogger is a trademark).

- **Goal.** Hop from the bottom of the screen to the castle at the top and reach the princess.
- **Roads.** Cars, trucks and buses run in both directions. Touch one and the frog explodes.
- **Rivers.** Water is deadly. Hop onto the logs and ride them across, but do not drift off the edge.
- **Controls.** Arrow keys or WASD on a keyboard. On touch screens swipe, tap to hop forward, or use the on-screen buttons.
- **Levels.** Each rescue starts a longer, faster level. You have three lives.

## Development

Everything is static: `index.html`, `src/main.js`, `src/style.css` and a vendored copy of [three.js](https://threejs.org/) in `vendor/`. There is no build step. To run it locally, serve the folder over HTTP (ES modules do not load from `file://`):

```
python3 -m http.server 8000
```

then open http://localhost:8000/. Pushing to `main` runs `.github/workflows/deploy.yml`, which uploads the site to GitHub Pages.

## What

A video game like Frogger, but in three dimensions.

- **The crossing.** The frog has to get across dangerous lanes, as in Frogger.
- **Getting killed.** The frog can get killed, and when it does, it explodes.
- **The goal.** If the frog survives, it saves the princess.

## Why

It is a fun, simple game with a clear goal, and moving a classic arcade idea into 3D opens up new ways to play.

## How

Early thoughts, to refine in a workshop:

- **Runs in the web browser.** Use a 3D graphics library for the browser, so it can be played anywhere and hosted on Coolify like the other projects.
- **What 3D adds.** A camera that follows the frog from behind, lanes that cross at different heights such as bridges and overpasses, and hazards coming from more than one direction.
- **The explosion.** A cartoon burst of pieces with a quick restart, so getting hit is funny rather than frustrating.
- **The princess.** A short rescue scene at the end of each level, and harder levels after that.
- **Its own name.** Frogger is a trademarked game, so this one should have its own name and look if it is ever shared.

## Open questions

- What should the game be called?
- What does the frog cross: roads, rivers, something more fantastical, or all of these across levels?
- Keyboard, game controller, or touch screen controls?
- One level to start, or several levels that get harder?
- Who is it for, and who gets to play-test it?

## Notes

- 2026-10-11: Built the first playable prototype (roads, rivers with logs, exploding frog, princess rescue, escalating levels) and set up GitHub Pages deployment through GitHub Actions.
- 2026-10-11: Captured from chat as a seed. The idea: a video game like Frogger transformed into three dimensions. The frog can get killed, and when it does it explodes. If it survives, it can save the princess.
