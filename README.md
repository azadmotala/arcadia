<div align="center">

<img src="docs/banner.png" alt="Space Cats' fleet in green pixel art, a mouse in a flying saucer, a rat knight, a bat and the fish, above the five cats: Storm in grey, Everest in white, Kaida in orange, Nala in yellow and Aster in purple" width="480">

# Arcadia

**Old-school arcade games that run in your browser, with a leaderboard just for your family and friends.**

<a href="https://azadmotala.github.io/arcadia/"><img src="https://img.shields.io/badge/%E2%96%B6%20Play%20now-in%20your%20browser-2ea44f?style=for-the-badge" alt="Play now in your browser" height="36"></a>

[![MIT license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

</div>

Somebody out there has a high score you'll never touch. Arcadia doesn't make you chase it. Make a board for your family or friends, send them the link, and the score to beat is your sister's.

Everything runs in the browser, on phones, tablets and computers. There's nothing to install and nobody signs up.

## The games

| Game | |
|---|---|
| [**Space Cats**](https://azadmotala.github.io/arcadia/games/space-cats/) | Mice in flying saucers, rat knights and bats march down on five cats. Pick your cat, shelter behind the moon rocks, and earn the last two cats by scoring points. [How to play](games/space-cats/README.md) |

More games are on the way. Each one lives in its own folder under `games/`.

<img src="docs/screenshot.png" alt="Space Cats in play: rows of green mice in saucers, rat knights and bats, a fish across the top, four moon rocks, and Nala the yellow cat firing up from below" width="420">

## Family boards

A board is a private code that sits at the end of a link, like `https://azadmotala.github.io/arcadia/?board=friday-night-crew-7e3xkq`.

1. Make one on the [home page](https://azadmotala.github.io/arcadia/#boards). Give it a name, and a few random letters go on the end so nobody can guess it.
2. Send the link to the family or your friends.
3. Everyone who opens it is on the board. Their device remembers it, and their best scores in each game go on that game's top 10.

Anyone with the link can see the board and add to it, so keep it to people you know. A board doesn't need setting up anywhere: it starts the first time someone posts a score to it.

## Run it locally

Serve the repo with any static web server. With Python:

```bash
git clone https://github.com/azadmotala/arcadia.git
cd arcadia
python -m http.server 8000
```

Then open http://localhost:8000. There's nothing to build. GitHub Pages serves the `main` branch as it is.

## Project layout

```
arcadia/
├── index.html            The home page: the games and the family board maker
├── assets/               The home page's styles, script, icon and screenshot
├── games/
│   └── space-cats/       Space Cats, with its own README
├── docs/                 Banner and screenshots for the READMEs
├── firestore.rules       Who can read and add leaderboard scores
├── firebase.json         Tells the Firebase CLI where the rules are
└── .firebaserc           Arcadia's Firebase project
```

The home page loads Space Cats' own script for its sprites and cats, so the page and the game always show the same cats. Change a cat in `games/space-cats/js/spacecats.js` and the home page follows.

## The leaderboards

Scores are kept in Firestore, in Arcadia's own Firebase project, `arcadia-63980`, with the database in Johannesburg (`africa-south1`). Players sign in anonymously without noticing, and that's all it takes to post a score.

Each board keeps each game's scores apart, at `boards/{code}/games/{game}/scores`. The rules in [`firestore.rules`](firestore.rules) let anyone read a board they know the code of, and let a signed-in game add a well-formed score to it. Nobody can change or delete one.

To publish the rules after changing them, with the [Firebase CLI](https://firebase.google.com/docs/cli):

```bash
firebase deploy --only firestore:rules
```

### Adding a game

1. Put it in its own folder under `games/`.
2. Copy Space Cats' `js/leaderboard.js` and set `GAME` to the new game's name.
3. Add that name to `isGame` in `firestore.rules` and publish the rules.
4. Give it a cabinet on the home page in `index.html`.

The board code, the player's initials and the anonymous sign-in are shared by every game, so a family board works across all of them.

## Credits

Space Cats builds on [spaceinvaders](https://github.com/dwmkerr/spaceinvaders) by Dave Kerr, which supplies its game engine, its starfield and its core gameplay. The cats are named after ours.

## License

[MIT](LICENSE). The original spaceinvaders code is also MIT, and its copyright notice is kept in the LICENSE file.
