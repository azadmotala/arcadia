/*
  spacecats.js

  The core logic for Space Cats.

*/

/*
    Game Class

    The Game class represents a game of Space Cats.
    Create an instance of it, change any of the default values
    in the settings, and call 'start' to run the game.

    Call 'initialise' before 'start' to set the canvas the game
    will draw to.

    Call 'moveShip' or 'shipFire' to control the ship.

    Listen for 'gameWon' or 'gameLost' events to handle the game
    ending.
*/

//  Constants for the keyboard.
var KEY_LEFT = 37;
var KEY_RIGHT = 39;
var KEY_SPACE = 32;

//  The three kinds of invader: mice in flying saucers along the top row, bats
//  in the bottom two and rat knights in between. Each is drawn from pixel
//  grids in two poses that swap as the fleet marches: # is the body, o is a
//  dark spot such as an eye, and . is see-through.
var INVADER_TYPES = {
  mouse: {
    points: 40,
    poses: [
      ['..##...##..',
       '..#######..',
       '..##o#o##..',
       '...#####...',
       '.#########.',
       '##o##o##o##',
       '.#########.'],
      ['..##...##..',
       '..#######..',
       '..##o#o##..',
       '...#####...',
       '.#########.',
       '###o###o###',
       '.#########.']
    ]
  },
  rat: {
    points: 20,
    poses: [
      ['...###...',
       '..#####..',
       '#.#####.#',
       '#########',
       '.#o###o#.',
       '..#####..',
       '...###...',
       '....#....'],
      ['...###...',
       '..#####..',
       '#.#####.#',
       '#########',
       '.#o###o#.',
       '..#####..',
       '...###...',
       '...#.#...']
    ]
  },
  bat: {
    points: 10,
    poses: [
      ['.#.......#.',
       '##..#.#..##',
       '###.###.###',
       '####o#o####',
       '.#########.',
       '..#.#.#.#..'],
      ['...........',
       '....#.#....',
       '#...###...#',
       '####o#o####',
       '###########',
       '.#.#...#.#.']
    ]
  }
};

//  Your cats, one per life. The one you pick goes first and the rest follow
//  in this order. A game starts with config.startCats of them, and each score
//  in config.bonusCatScores brings in another. Change a name, face or colour
//  here. The faces are in CAT_FACES below.
var CATS = [
  { name: 'Storm', face: 'tabby', colour: '#a3a3a3' },
  { name: 'Everest', face: 'plain', colour: '#f5f5f5' },
  { name: 'Kaida', face: 'patch', colour: '#ffa726' },
  { name: 'Nala', face: 'folded', colour: '#fde047' },
  { name: 'Aster', face: 'spots', colour: '#a78bfa' }
];

//  Cat faces, drawn like the invaders: # is fur, o is a dark spot and . is
//  see-through. Each one is the plain face with a few pixels changed.
var CAT_FACES = (function() {
  var plain = ['#.........#',
               '##.......##',
               '###.....###',
               '###########',
               '###o###o###',
               '###########',
               '#####o#####',
               '.#########.',
               '..#######..'];
  function change(rows) {
    var face = plain.slice();
    for (var row in rows) {
      face[row] = rows[row];
    }
    return face;
  }
  return {
    plain: plain,
    tabby: change({ 3: '####o#o####', 5: '#o#######o#' }),
    blaze: change({ 3: '#####o#####', 4: '###o#o#o###', 5: '#####o#####' }),
    folded: change({ 0: '...........', 1: '##.......##', 2: '####...####' }),
    spots: change({ 3: '##o########', 5: '#######o###', 7: '.###o#####.' }),
    patch: change({ 3: '#oo########', 4: '#ooo###o###', 5: '#oo########' })
  };
})();

//  How many game pixels each pixel of a cat takes up. Cats are drawn a
//  little bigger than the invaders.
var CAT_PIXEL_SIZE = 2;

//  The colour for cats you haven't brought in yet, shown waiting by the lives.
var CAT_WAITING_COLOUR = '#3f3f46';

//  How many game pixels each grid pixel takes up.
var INVADER_PIXEL_SIZE = 1.5;

//  The invaders swap poses each time the fleet moves this far.
var INVADER_STEP = 16;

//  The march, and the heartbeat with it, never goes faster than this, so the
//  heartbeat stays a beat rather than a buzz.
var INVADER_MAX_STEPS_PER_SECOND = 8;

//  The fleet's footsteps: a low tick and tock, one per step it takes.
//  Frequencies in Hz.
var HEARTBEAT_NOTES = [82.4, 110];

//  The fish that swims across the top now and then. It's drawn facing left,
//  and turned round when it swims to the right.
var FISH_PIXELS = [
  '...####....#',
  '.########.##',
  '##o#########',
  '.########.##',
  '...####....#'
];
var FISH_COLOUR = '#64dd17';

//  Shooting the fish scores one of these, picked at random: usually 100,
//  often 200, and now and then 300 or 500.
var FISH_POINTS = [100, 100, 100, 200, 200, 300, 500];

//  It doesn't come once the fleet is down to fewer invaders than this.
var FISH_MIN_INVADERS = 8;

//  The three notes it bubbles as it swims, in Hz.
var FISH_NOTES = [988, 1319, 1175];

//  Shields: moon rocks between your cat and the invaders. Bombs and your own
//  shots blast holes in them, and invaders crush them as they march down.
//  They're rebuilt for each wave.
var SHIELD_PIXELS = [
  '......#####..###......',
  '....##########.####...',
  '...#################..',
  '..###################.',
  '.####################.',
  '######################',
  '######################',
  '######################',
  '######################',
  '######################',
  '.####################.',
  '.###################..',
  '..#################...',
  '....############......'
];
var SHIELD_COLOUR = '#64dd17';

//  The game's version, read from the ?v= on this script's link in index.html,
//  so it's set in one place with each release. Blank if there isn't one.
var GAME_VERSION = (function() {
  var script = document.currentScript;
  var match = script && /[?&]v=([^&]+)/.exec(script.src);
  return match ? match[1] : '';
})();

//  The high score is kept in the browser, so it lasts between visits on the
//  same device. Some browsers block storage, in private browsing for
//  example; then the game still works, the best just isn't kept.
var HIGH_SCORE_KEY = 'arcadia.space-cats.highScore';

function loadHighScore() {
  try {
    return parseInt(window.localStorage.getItem(HIGH_SCORE_KEY), 10) || 0;
  } catch (e) {
    return 0;
  }
}

function saveHighScore(score) {
  try {
    window.localStorage.setItem(HIGH_SCORE_KEY, String(score));
  } catch (e) {
    //  Storage is blocked or full, so this best won't be kept.
  }
}

//  Which cat you play as is kept the same way, so the game remembers it.
var CAT_KEY = 'arcadia.space-cats.cat';

function loadChosenCat() {
  try {
    var cat = parseInt(window.localStorage.getItem(CAT_KEY), 10);
    return cat >= 0 && cat < CATS.length ? cat : 0;
  } catch (e) {
    return 0;
  }
}

function saveChosenCat(cat) {
  try {
    window.localStorage.setItem(CAT_KEY, String(cat));
  } catch (e) {
    //  Storage is blocked, so the choice lasts until the page closes.
  }
}

//  Invader body colours. Green is the standard one.
var INVADER_COLOURS = ['#ffa726', '#64dd17', '#2962ff'];
var ORIGINAL_INVADER_COLOUR = 1;

//  Creates an instance of the Game class.
function Game() {

  //  Set the initial config.
  this.config = {
    bombRate: 0.05,
    bombMinVelocity: 50,
    bombMaxVelocity: 50,
    invaderInitialVelocity: 25,
    invaderAcceleration: 0,
    invaderDropDistance: 20,
    invaderSpeedUpMax: 3,
    rocketVelocity: 120,
    rocketMaxFireRate: 2,
    gameWidth: 400,
    gameHeight: 300,
    fps: 50,
    debugMode: false,
    invaderRanks: 5,
    invaderFiles: 10,
    shipSpeed: 120,
    levelDifficultyMultiplier: 0.2,
    limitLevelIncrease: 25,
    fishSpeed: 70,
    fishMinInterval: 15,
    fishMaxInterval: 30,
    touchShipSpeed: 360,
    shieldCount: 4,
    startCats: 3,
    bonusCatScores: [2000, 6000]
  };

  //  All state is in the variables below.
  this.lives = 3;
  this.width = 0;
  this.height = 0;
  this.gameBounds = { left: 0, top: 0, right: 0, bottom: 0 };
  this.intervalId = 0;
  this.score = 0;
  this.level = 1;

  //  The state stack.
  this.stateStack = [];

  //  Input/output
  this.pressedKeys = {};
  this.gameCanvas = null;

  //  All sounds.
  this.sounds = null;

  //  Touch input: true once the player is using a touch screen, the finger
  //  that's steering the ship, and how far it has dragged (in game pixels)
  //  since the last update.
  this.touchMode = false;
  this.touch = null;
  this.touchDrag = 0;

  //  Called whenever the state changes, so the page can update its buttons.
  this.onStateChange = null;

  //  The page to go back to from the start screen on touch screens, if any.
  this.homeUrl = null;

  //  The best score on this device, and what it was when this game began,
  //  to tell whether this game beat it.
  this.highScore = loadHighScore();
  this.highScoreAtStart = this.highScore;

  //  The cat you play as, how many cats this game has lost and how many
  //  bonus cats it has brought in. lives is how many cats are left to play,
  //  counting the one playing now.
  this.chosenCat = loadChosenCat();
  this.catsLost = 0;
  this.bonusCats = 0;

  //  A message across the middle of the play area, such as a cat joining,
  //  and how much longer to show it.
  this.message = null;
  this.messageTime = 0;

  //  Invader colour: the standard green, or with randomColours on, a new
  //  colour for each wave.
  this.randomColours = false;
  this.invaderColour = ORIGINAL_INVADER_COLOUR;

  //  Every kind of invader, drawn once in each colour and pose:
  //  invaderSprites[type][colour][pose].
  this.invaderSprites = {};
  for (var type in INVADER_TYPES) {
    this.invaderSprites[type] = INVADER_COLOURS.map(function(colour) {
      return INVADER_TYPES[type].poses.map(function(pixels) {
        return drawPixelSprite(pixels, colour);
      });
    });
  }

  //  The fish facing left, and facing right.
  var fishRight = FISH_PIXELS.map(function(row) { return row.split('').reverse().join(''); });
  this.fishSprites = { left: drawPixelSprite(FISH_PIXELS, FISH_COLOUR), right: drawPixelSprite(fishRight, FISH_COLOUR) };

  //  Each cat in its own colour, and in grey for when it's still to come.
  this.catSprites = CATS.map(function(cat) { return drawPixelSprite(CAT_FACES[cat.face], cat.colour); });
  this.waitingCatSprites = CATS.map(function(cat) { return drawPixelSprite(CAT_FACES[cat.face], CAT_WAITING_COLOUR); });

  //  Which cat the browser tab shows. None yet.
  this.tabIconCat = null;
  this.updateTabIcon();
}

//  Initialis the Game with a canvas.
Game.prototype.initialise = function(gameCanvas) {

  //  Set the game canvas.
  this.gameCanvas = gameCanvas;

  //  Set the game width and height.
  this.width = gameCanvas.width;
  this.height = gameCanvas.height;

  //  Set the state game bounds.
  this.gameBounds = {
    left: gameCanvas.width / 2 - this.config.gameWidth / 2,
    right: gameCanvas.width / 2 + this.config.gameWidth / 2,
    top: gameCanvas.height / 2 - this.config.gameHeight / 2,
    bottom: gameCanvas.height / 2 + this.config.gameHeight / 2,
  };
};

Game.prototype.moveToState = function(state) {

  //  If we are in a state, leave it.
  if (this.currentState() && this.currentState().leave) {
    this.currentState().leave(game);
    this.stateStack.pop();
  }

  //  If there's an enter function for the new state, call it.
  if (state.enter) {
    state.enter(game);
  }

  //  Set the current state.
  this.stateStack.pop();
  this.stateStack.push(state);
  this.stateChanged();
};

Game.prototype.stateChanged = function() {
  if (this.onStateChange) {
    this.onStateChange();
  }
};

//  Start the Game.
Game.prototype.start = function() {

  //  The sounds are made in code, so there's nothing to load.
  this.sounds = new Sounds();
  this.sounds.init();

  //  Move into the 'welcome' state.
  this.moveToState(new WelcomeState());

  //  Set the game variables.
  this.lives = this.startCats();
  this.config.debugMode = /debug=true/.test(window.location.href);

  //  Start the game loop.
  var game = this;
  this.intervalId = setInterval(function() { GameLoop(game); }, 1000 / this.config.fps);

};

//  Returns the current state.
Game.prototype.currentState = function() {
  return this.stateStack.length > 0 ? this.stateStack[this.stateStack.length - 1] : null;
};

//  Mutes or unmutes the game.
Game.prototype.mute = function(mute) {

  //  If we've been told to mute, mute.
  if (mute === true) {
    this.sounds.mute = true;
  } else if (mute === false) {
    this.sounds.mute = false;
  } else {
    // Toggle mute instead...
    this.sounds.mute = this.sounds.mute ? false : true;
  }
};

//  The main loop.
function GameLoop(game) {
  var currentState = game.currentState();
  if (currentState) {

    //  Delta t is the time to update/draw.
    var dt = 1 / game.config.fps;

    //  Get the drawing context.
    var ctx = this.gameCanvas.getContext("2d");

    //  Update if we have an update function. Also draw
    //  if we have a draw function.
    if (currentState.update) {
      currentState.update(game, dt);
    }
    if (currentState.draw) {
      currentState.draw(game, dt, ctx);
    }
  }
}

Game.prototype.pushState = function(state) {

  //  If there's an enter function for the new state, call it.
  if (state.enter) {
    state.enter(game);
  }
  //  Set the current state.
  this.stateStack.push(state);
  this.stateChanged();
};

Game.prototype.popState = function() {

  //  Leave and pop the state.
  if (this.currentState()) {
    if (this.currentState().leave) {
      this.currentState().leave(game);
    }

    //  Set the current state.
    this.stateStack.pop();
    this.stateChanged();
  }
};

//  Switches between the original invader colour and random colours. A wave
//  in play changes straight away; otherwise the next wave picks.
Game.prototype.toggleRandomColours = function() {
  this.randomColours = !this.randomColours;
  var state = this.currentState();
  if (state instanceof PlayState || state instanceof PauseState) {
    this.pickInvaderColour();
  }
};

//  Picks the invader colour for a wave. With random colours on, it's never
//  the colour that's showing now, so every wave looks different.
Game.prototype.pickInvaderColour = function() {
  if (!this.randomColours) {
    this.invaderColour = ORIGINAL_INVADER_COLOUR;
  } else {
    var colour = Math.floor(Math.random() * (INVADER_COLOURS.length - 1));
    this.invaderColour = colour >= this.invaderColour ? colour + 1 : colour;
  }
  this.updateTabIcon();
};

//  Draws the cat you play as in the browser tab, from the same sprite as in
//  the game. icons/favicon-32.png is shown until this runs, and in browsers
//  that don't redraw tab icons.
Game.prototype.updateTabIcon = function() {
  var link = document.getElementById('tabIcon');
  if (!link || this.tabIconCat === this.chosenCat) {
    return;
  }
  var size = 32;
  var sprite = this.catSprites[this.chosenCat];
  var icon = document.createElement('canvas');
  icon.width = icon.height = size;
  var ctx = icon.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);
  //  Two icon pixels to each sprite pixel, kept sharp, in the middle.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, (size - sprite.width * 2) / 2, (size - sprite.height * 2) / 2,
    sprite.width * 2, sprite.height * 2);
  link.href = icon.toDataURL('image/png');
  this.tabIconCat = this.chosenCat;
};

//  Picks the cat to play as, and remembers it.
Game.prototype.chooseCat = function(cat) {
  this.chosenCat = (cat + CATS.length) % CATS.length;
  saveChosenCat(this.chosenCat);
  this.updateTabIcon();
};

//  Every cat in the order they play: yours first, then the rest.
Game.prototype.catOrder = function() {
  var order = [this.chosenCat];
  for (var i = 0; i < CATS.length; i++) {
    if (i !== this.chosenCat) {
      order.push(i);
    }
  }
  return order;
};

//  The cat playing now.
Game.prototype.currentCat = function() {
  return this.catOrder()[Math.min(this.catsLost, CATS.length - 1)];
};

//  How many cats a game starts with.
Game.prototype.startCats = function() {
  return Math.min(this.config.startCats, CATS.length);
};

//  How many bonus cats a game can bring in: one per score in bonusCatScores,
//  as long as there are cats left to bring.
Game.prototype.maxBonusCats = function() {
  return Math.min(this.config.bonusCatScores.length, CATS.length - this.startCats());
};

//  Shows a message across the middle of the play area for a couple of seconds.
Game.prototype.showMessage = function(text, colour) {
  this.message = { text: text, colour: colour || '#ffd54f' };
  this.messageTime = 2;
};

//  Starts a new game from level 1.
Game.prototype.newGame = function() {
  this.level = 1;
  this.score = 0;
  this.lives = this.startCats();
  this.catsLost = 0;
  this.bonusCats = 0;
  this.highScoreAtStart = this.highScore;
  this.message = null;
  this.messageTime = 0;
  this.moveToState(new LevelIntroState(1));
};

//  Adds points to the score, and saves a new high score as soon as it's
//  reached, so closing the page mid-game doesn't lose it. Each score in
//  bonusCatScores brings in the next cat, which is an extra life.
Game.prototype.addScore = function(points) {
  this.score += points;
  if (this.score > this.highScore) {
    this.highScore = this.score;
    saveHighScore(this.highScore);
  }
  while (this.bonusCats < this.maxBonusCats() && this.score >= this.config.bonusCatScores[this.bonusCats]) {
    var cat = CATS[this.catOrder()[this.startCats() + this.bonusCats]];
    this.bonusCats++;
    this.lives++;
    this.showMessage(cat.name + ' joins!', cat.colour);
    this.sounds.playSound('join');
  }
};

//  A bomb or an invader has caught the cat that's playing. It floats home
//  and the next cat takes over, if there's one left.
Game.prototype.loseCat = function() {
  var lost = CATS[this.currentCat()];
  this.lives--;
  this.catsLost++;
  this.sounds.playSound('meow');
  if (this.lives > 0) {
    var next = CATS[this.currentCat()];
    this.showMessage(lost.name + ' floats home. ' + (this.lives === 1 ? next.name + ' is the last cat!' : next.name + "'s turn!"), next.colour);
  }
};

//  Pauses or resumes play. Does nothing outside of play.
Game.prototype.togglePause = function() {
  var state = this.currentState();
  if (state instanceof PauseState) {
    this.popState();
  } else if (state instanceof PlayState) {
    this.pushState(new PauseState());
  }
};

//  The stop function stops the game.
Game.prototype.stop = function Stop() {
  clearInterval(this.intervalId);
};

//  Inform the game a key is down.
Game.prototype.keyDown = function(keyCode) {
  this.pressedKeys[keyCode] = true;
  //  Delegate to the current state too.
  if (this.currentState() && this.currentState().keyDown) {
    this.currentState().keyDown(this, keyCode);
  }
};

//  Touch controls: drag anywhere to move the ship, and it keeps firing while
//  a finger is down, like holding the space bar.
Game.prototype.touchstart = function(e) {
  this.touchMode = true;
  if (!this.touch) {
    var touch = e.changedTouches[0];
    this.touch = { id: touch.identifier, x: touch.clientX };
  }
  this.pressedKeys[KEY_SPACE] = true;

  //  A tap resumes a paused game. A screen can take the tap for itself, like
  //  the start screen picking a cat. Otherwise it acts like the space bar.
  var state = this.currentState();
  var touched = e.changedTouches[0];
  if (state instanceof PauseState) {
    this.popState();
  } else if (state && state.tap && state.tap(this, this.toGamePoint(touched.clientX, touched.clientY))) {
    return;
  } else if (state && state.keyDown) {
    state.keyDown(this, KEY_SPACE);
  }
};

//  A mouse click, which only does anything on screens that take taps.
Game.prototype.click = function(e) {
  var state = this.currentState();
  if (state && state.tap) {
    state.tap(this, this.toGamePoint(e.clientX, e.clientY));
  }
};

//  Where a point on the page is in the game, in game pixels.
Game.prototype.toGamePoint = function(clientX, clientY) {
  var rect = this.gameCanvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * this.width / rect.width,
    y: (clientY - rect.top) * this.height / rect.height
  };
};

Game.prototype.touchmove = function(e) {
  for (var i = 0; i < e.changedTouches.length; i++) {
    var touch = e.changedTouches[i];
    if (!this.touch || touch.identifier !== this.touch.id) {
      continue;
    }

    //  Only steer during play, and convert from screen to game pixels.
    if (this.currentState() instanceof PlayState) {
      var scale = this.gameCanvas.getBoundingClientRect().width / this.width;
      this.touchDrag += (touch.clientX - this.touch.x) / scale;
    }
    this.touch.x = touch.clientX;
  }
};

Game.prototype.touchend = function(e) {
  if (e.touches.length === 0) {
    this.touch = null;
    delete this.pressedKeys[KEY_SPACE];
    return;
  }

  //  If the steering finger lifted, steer with one that's still down.
  for (var i = 0; i < e.changedTouches.length; i++) {
    if (this.touch && e.changedTouches[i].identifier === this.touch.id) {
      this.touch = { id: e.touches[0].identifier, x: e.touches[0].clientX };
    }
  }
};

//  Inform the game a key is up.
Game.prototype.keyUp = function(keyCode) {
  delete this.pressedKeys[keyCode];
  //  Delegate to the current state too.
  if (this.currentState() && this.currentState().keyUp) {
    this.currentState().keyUp(this, keyCode);
  }
};

function WelcomeState() {

  //  Where the row of cats was last drawn, so a tap can tell which was picked.
  this.catsY = 0;
}

//  How far apart the cats stand on the start screen, and how big they are.
var PICKER_SPACING = 64;
var PICKER_PIXEL_SIZE = 2.5;

//  The middle of each cat on the start screen.
function pickerCatX(game, cat) {
  return game.width / 2 + (cat - (CATS.length - 1) / 2) * PICKER_SPACING;
}

WelcomeState.prototype.draw = function(game, dt, ctx) {

  //  Clear the background.
  ctx.clearRect(0, 0, game.width, game.height);

  //  With a leaderboard, everything moves up to make room for it.
  var hasBoard = hasLeaderboard(game);
  var x = game.width / 2;
  var y = hasBoard ? 158 : game.height / 2 - 60;

  ctx.font = "30px Arial";
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText("Space Cats", x, y);

  //  The cats to pick from, with a box round the one you'll play as.
  this.catsY = y + 42;
  drawCatPicker(game, ctx, this.catsY);

  ctx.font = "16px Arial";
  ctx.fillStyle = '#ffffff';
  if (game.touchMode) {
    ctx.fillText("Tap a cat to pick it. Tap anywhere else to start.", x, y + 96);
    ctx.fillText("Drag anywhere to move. Hold to keep firing.", x, y + 120);
  } else {
    ctx.fillText("Pick your cat with ← → or a click. Press Space to start.", x, y + 96);
  }
  if (hasBoard) {
    drawLeaderboard(game, ctx, y + 146);
  } else if (game.highScore > 0) {
    ctx.fillText("High score: " + game.highScore, x, y + 150);
  }
  if (GAME_VERSION) {
    ctx.font = "12px Arial";
    ctx.fillStyle = '#888888';
    ctx.fillText("Version " + GAME_VERSION, game.width / 2, game.gameBounds.bottom + 85);
  }

  //  On touch screens, where the page's own link is hidden, a way back to
  //  the Arcadia home page in the top corner.
  if (hasHomeLink(game)) {
    ctx.font = "14px Arial";
    ctx.fillStyle = SHIELD_COLOUR;
    ctx.textAlign = "left";
    ctx.fillText("‹ Arcadia", HOME_LINK.x, HOME_LINK.y);
    ctx.textAlign = "center";
  }
};

//  Where the link back to Arcadia sits on the start screen, in game pixels.
var HOME_LINK = { x: 190, y: 140, width: 80, height: 28 };

function hasHomeLink(game) {
  return !!(game.homeUrl && game.touchMode);
}

//  Draws the five cats in a row, each with its name, centred on y.
function drawCatPicker(game, ctx, y) {
  var width = CAT_FACES.plain[0].length * PICKER_PIXEL_SIZE;
  var height = CAT_FACES.plain.length * PICKER_PIXEL_SIZE;
  ctx.imageSmoothingEnabled = false;
  for (var i = 0; i < CATS.length; i++) {
    var catX = pickerCatX(game, i);
    ctx.drawImage(game.catSprites[i], catX - width / 2, y - height / 2 - 6, width, height);
    var chosen = i === game.chosenCat;
    ctx.font = "12px Arial";
    ctx.fillStyle = chosen ? CATS[i].colour : '#888888';
    ctx.fillText(CATS[i].name, catX, y + 16);
    if (chosen) {
      ctx.strokeStyle = CATS[i].colour;
      ctx.lineWidth = 1;
      ctx.strokeRect(catX - PICKER_SPACING / 2 + 4, y - 26, PICKER_SPACING - 8, 52);
    }
  }
  ctx.imageSmoothingEnabled = true;
}

WelcomeState.prototype.keyDown = function(game, keyCode) {
  if (keyCode == KEY_SPACE) {
    //  Space starts the game.
    game.newGame();
  } else if (keyCode == KEY_LEFT || keyCode == KEY_RIGHT) {
    game.chooseCat(game.chosenCat + (keyCode == KEY_LEFT ? -1 : 1));
  }
};

//  A tap or click on a cat picks it, one on the Arcadia link goes home, and
//  one on the leaderboard's switch changes which top 10 it shows. Says
//  whether it hit any of them.
WelcomeState.prototype.tap = function(game, point) {
  if (hasHomeLink(game) && point.x >= HOME_LINK.x - 10 && point.x <= HOME_LINK.x + HOME_LINK.width &&
    Math.abs(point.y - HOME_LINK.y) <= HOME_LINK.height / 2) {
    window.location.href = game.homeUrl;
    return true;
  }
  if (tapBoardSwitch(game, point)) {
    return true;
  }
  if (Math.abs(point.y - this.catsY) > 30) {
    return false;
  }
  for (var i = 0; i < CATS.length; i++) {
    if (Math.abs(point.x - pickerCatX(game, i)) <= PICKER_SPACING / 2) {
      game.chooseCat(i);
      return true;
    }
  }
  return false;
};

function GameOverState() {

}

GameOverState.prototype.update = function(game, dt) {

};

GameOverState.prototype.draw = function(game, dt, ctx) {

  //  Clear the background.
  ctx.clearRect(0, 0, game.width, game.height);

  //  With a leaderboard, everything moves up to make room for it.
  var hasBoard = hasLeaderboard(game);
  var x = game.width / 2;
  var y = hasBoard ? 165 : game.height / 2 - 40;

  ctx.font = "30px Arial";
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText("Game Over!", x, y);
  ctx.font = "16px Arial";
  ctx.fillText("You scored " + game.score + " and got to level " + game.level, x, y + 40);
  if (game.score > game.highScoreAtStart) {
    ctx.fillStyle = '#ffd54f';
    ctx.fillText("New high score!", x, y + 66);
    ctx.fillStyle = '#ffffff';
  } else {
    ctx.fillText("High score: " + game.highScore, x, y + 66);
  }
  if (hasBoard) {
    drawLeaderboard(game, ctx, y + 96);
  }
  ctx.font = "16px Arial";
  ctx.fillStyle = '#ffffff';
  ctx.fillText(game.touchMode ? "Tap to pick a cat and play again." : "Press Space to pick a cat and play again.", x, hasBoard ? y + 328 : y + 92);
};

//  A tap or click on the leaderboard's switch changes which top 10 it shows.
GameOverState.prototype.tap = function(game, point) {
  return tapBoardSwitch(game, point);
};

//  Whether this device has a leaderboard to show (see js/leaderboard.js).
function hasLeaderboard(game) {
  return !!(game.leaderboard && game.leaderboard.board());
}

//  Draws the leaderboard from y down: the board's name, a switch between
//  this week's top 10 and the all-time one, the scores, and under them who
//  won last week. The score just added is picked out, scores from this
//  device that are still waiting to go up are grey, and last week's winner
//  has a crown if they're on this week's board too. It says if the board
//  couldn't be reached.
function drawLeaderboard(game, ctx, y) {
  var board = game.leaderboard;
  var weekly = game.boardView !== 'all';
  var entries = board.top(weekly ? 'week' : 'all');
  var champion = weekly ? board.champion() : null;
  var x = game.width / 2;
  var rowsY = y + 40;
  var footerY = rowsY + Math.max(entries.length, 1) * 17 + 3;
  ctx.textAlign = "center";
  ctx.font = "14px Arial";
  ctx.fillStyle = '#ffd54f';
  ctx.fillText(board.name() || "Leaderboard", x, y);
  drawBoardSwitch(game, ctx, y + 20, weekly);
  ctx.font = "13px Arial";
  if (!entries.length) {
    ctx.fillStyle = '#888888';
    ctx.fillText(board.status() === 'loading' ? "Loading…" :
      (weekly ? "No scores yet this week. Be the first!" : "No scores yet. Be the first!"), x, rowsY);
  }
  var crowned = false;
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var rowY = rowsY + i * 17;
    if (champion && !crowned && entry.initials === champion.initials) {
      drawCrown(ctx, x - 74, rowY);
      crowned = true;
    }
    ctx.fillStyle = entry.id === board.highlightId ? '#ffd54f' : (entry.pending ? '#999999' : '#ffffff');
    ctx.textAlign = "right";
    ctx.fillText((i + 1) + ".", x - 44, rowY);
    ctx.textAlign = "left";
    ctx.fillText(entry.initials, x - 34, rowY);
    ctx.textAlign = "right";
    ctx.fillText(entry.score, x + 56, rowY);
  }
  ctx.textAlign = "center";
  if (board.status() === 'offline') {
    ctx.fillStyle = '#888888';
    ctx.fillText("Leaderboard offline", x, footerY);
  } else if (champion) {
    var text = champion.initials + " won last week with " + champion.score;
    var width = CROWN_WIDTH + 6 + ctx.measureText(text).width;
    drawCrown(ctx, x - width / 2 + CROWN_WIDTH / 2, footerY);
    ctx.textAlign = "left";
    ctx.fillStyle = '#ffd54f';
    ctx.fillText(text, x - width / 2 + CROWN_WIDTH + 6, footerY);
  } else if (weekly && board.status() === 'online') {
    ctx.fillStyle = '#888888';
    ctx.fillText("Starts afresh every Monday", x, footerY);
  }
  ctx.textAlign = "center";
  ctx.fillStyle = '#ffffff';
}

//  The two top 10s the leaderboard can show, side by side above it.
var BOARD_VIEWS = [
  { view: 'week', label: "This week" },
  { view: 'all', label: "All time" }
];
var BOARD_SWITCH_GAP = 24;

//  Draws the switch between this week's top 10 and the all-time one,
//  centred on y, with a line under the one showing. Remembers where it is,
//  so a tap can tell which was picked.
function drawBoardSwitch(game, ctx, y, weekly) {
  var x = game.width / 2;
  ctx.font = "13px Arial";
  ctx.textAlign = "left";
  var widths = BOARD_VIEWS.map(function(option) { return ctx.measureText(option.label).width; });
  var left = x - (widths[0] + BOARD_SWITCH_GAP + widths[1]) / 2;
  for (var i = 0; i < BOARD_VIEWS.length; i++) {
    var chosen = (BOARD_VIEWS[i].view === 'week') === weekly;
    ctx.fillStyle = chosen ? '#ffffff' : '#888888';
    ctx.fillText(BOARD_VIEWS[i].label, left, y);
    if (chosen) {
      ctx.fillRect(left, y + 9, widths[i], 1);
    }
    left += widths[i] + BOARD_SWITCH_GAP;
  }
  ctx.textAlign = "center";
  game.boardSwitch = { x: x, y: y };
}

//  A tap on the switch above the leaderboard shows this week's top 10 (the
//  left half) or the all-time one (the right half). Says whether it hit.
function tapBoardSwitch(game, point) {
  var tapped = game.boardSwitch;
  if (!hasLeaderboard(game) || !tapped || Math.abs(point.y - tapped.y) > 14 || Math.abs(point.x - tapped.x) > 90) {
    return false;
  }
  game.boardView = point.x < tapped.x ? 'week' : 'all';
  return true;
}

//  A little gold crown for last week's winner, centred on x, y.
var CROWN = [
  "X..X..X",
  "XX.X.XX",
  "XXXXXXX",
  "XXXXXXX"
];
var CROWN_PIXEL_SIZE = 2;
var CROWN_WIDTH = CROWN[0].length * CROWN_PIXEL_SIZE;

function drawCrown(ctx, x, y) {
  var left = x - CROWN_WIDTH / 2;
  var top = y - CROWN.length * CROWN_PIXEL_SIZE / 2 - 1;
  ctx.fillStyle = '#ffd54f';
  for (var row = 0; row < CROWN.length; row++) {
    for (var col = 0; col < CROWN[row].length; col++) {
      if (CROWN[row].charAt(col) === 'X') {
        ctx.fillRect(left + col * CROWN_PIXEL_SIZE, top + row * CROWN_PIXEL_SIZE, CROWN_PIXEL_SIZE, CROWN_PIXEL_SIZE);
      }
    }
  }
}

GameOverState.prototype.keyDown = function(game, keyCode) {
  if (keyCode == KEY_SPACE) {
    //  Space goes back to the start screen, so the next player can pick
    //  their cat.
    game.moveToState(new WelcomeState());
  }
};

//  Create a PlayState with the game config and the level you are on.
function PlayState(config, level) {
  this.config = config;
  this.level = level;

  //  Game state.
  this.invaderCurrentVelocity = 10;
  this.invaderCurrentDropDistance = 0;
  this.invadersAreDropping = false;
  this.lastRocketTime = null;

  //  How many invaders the wave started with.
  this.invaderCount = 0;

  //  Which pose the invaders are in, and how far they've moved since it changed.
  this.invaderPose = 0;
  this.invaderStepDistance = 0;

  //  The heartbeat note to play on the next step.
  this.heartbeatNote = 0;

  //  The fish, if one is swimming, how long until the next one comes, and
  //  the score to show where one was shot.
  this.fish = null;
  this.fishTimer = 0;
  this.fishScore = null;

  //  The moon rocks between your cat and the invaders.
  this.shields = [];

  //  Where a touch drag is taking the ship, if anywhere.
  this.shipTargetX = null;

  //  Game entities.
  this.ship = null;
  this.invaders = [];
  this.rockets = [];
  this.bombs = [];
}

PlayState.prototype.enter = function(game) {

  //  Create the ship.
  this.ship = new Ship(game.width / 2, game.gameBounds.bottom);

  //  Setup initial state.
  this.invaderCurrentVelocity = 10;
  this.invaderCurrentDropDistance = 0;
  this.invadersAreDropping = false;
  game.touchDrag = 0;

  //  Set the ship speed for this level, as well as invader params.
  var levelMultiplier = this.level * this.config.levelDifficultyMultiplier;
  var limitLevel = (this.level < this.config.limitLevelIncrease ? this.level : this.config.limitLevelIncrease);
  this.shipSpeed = this.config.shipSpeed;
  this.invaderInitialVelocity = this.config.invaderInitialVelocity + 1.5 * (levelMultiplier * this.config.invaderInitialVelocity);
  this.bombRate = this.config.bombRate + (levelMultiplier * this.config.bombRate);
  this.bombMinVelocity = this.config.bombMinVelocity + (levelMultiplier * this.config.bombMinVelocity);
  this.bombMaxVelocity = this.config.bombMaxVelocity + (levelMultiplier * this.config.bombMaxVelocity);
  this.rocketMaxFireRate = this.config.rocketMaxFireRate + 0.4 * limitLevel;

  //  Create the invaders.
  var ranks = this.config.invaderRanks + 0.1 * limitLevel;
  var files = this.config.invaderFiles + 0.2 * limitLevel;
  var invaders = [];
  var rankCount = Math.ceil(ranks);
  game.pickInvaderColour();
  for (var rank = 0; rank < ranks; rank++) {
    //  Mice in the top row, bats in the bottom two, rat knights in between.
    var type = rank === 0 ? 'mouse' : (rank >= rankCount - 2 ? 'bat' : 'rat');
    for (var file = 0; file < files; file++) {
      invaders.push(new Invader(
        (game.width / 2) + ((files / 2 - file) * 200 / files),
        (game.gameBounds.top + rank * 20),
        rank, file, type));
    }
  }
  this.invaders = invaders;
  this.invaderCount = invaders.length;
  this.resetFishTimer();

  //  Fresh shields for each wave, spread evenly above the ship.
  this.shields = [];
  var playWidth = game.gameBounds.right - game.gameBounds.left;
  for (var n = 0; n < this.config.shieldCount; n++) {
    this.shields.push(new Shield(
      game.gameBounds.left + playWidth * (n + 0.5) / this.config.shieldCount,
      game.gameBounds.bottom - 45));
  }
  this.invaderCurrentVelocity = this.invaderInitialVelocity;
  this.invaderVelocity = { x: -this.invaderInitialVelocity, y: 0 };
  this.invaderNextVelocity = null;
};

//  The fleet speeds up as you thin it out. It's gentle at first: with half
//  the invaders left it's about 1.4 times as fast, with a quarter left twice
//  as fast, and the last few reach invaderSpeedUpMax.
PlayState.prototype.fleetSpeedUp = function() {
  return Math.min(Math.sqrt(this.invaderCount / this.invaders.length), this.config.invaderSpeedUpMax);
};

//  Where a shot or bomb travelling straight up or down at x, from y1 to y2,
//  first meets a shield, if it does. Checks every half pixel of the way, so
//  fast bombs can't skip through.
PlayState.prototype.shieldHit = function(x, y1, y2) {
  var steps = Math.ceil(Math.abs(y2 - y1) / (INVADER_PIXEL_SIZE / 2));
  for (var i = 0; i < this.shields.length; i++) {
    var shield = this.shields[i];
    if (Math.abs(x - shield.x) > shield.width / 2) {
      continue;
    }
    for (var j = 0; j <= steps; j++) {
      var y = steps ? y1 + (y2 - y1) * j / steps : y1;
      if (shield.isSolidAt(x, y)) {
        return { shield: shield, y: y };
      }
    }
  }
  return null;
};

//  Sets how long until the next fish comes.
PlayState.prototype.resetFishTimer = function() {
  this.fishTimer = this.config.fishMinInterval + Math.random() * (this.config.fishMaxInterval - this.config.fishMinInterval);
};

//  A fish swims across the top now and then, from either side, bubbling as
//  it goes. It stops coming once the fleet is down to its last few.
PlayState.prototype.updateFish = function(game, dt) {
  var margin = 20 + FISH_PIXELS[0].length * INVADER_PIXEL_SIZE / 2;
  if (!this.fish) {
    if (this.invaders.length >= FISH_MIN_INVADERS) {
      this.fishTimer -= dt;
      if (this.fishTimer <= 0) {
        var fromLeft = Math.random() < 0.5;
        this.fish = new Fish(
          fromLeft ? game.gameBounds.left - margin : game.gameBounds.right + margin,
          game.gameBounds.top - 16,
          fromLeft ? this.config.fishSpeed : -this.config.fishSpeed);
      }
    }
  } else {
    this.fish.x += this.fish.velocity * dt;
    this.fish.noteTime -= dt;
    if (this.fish.noteTime <= 0) {
      game.sounds.playNote(FISH_NOTES[this.fish.note], 0.06, 0.03);
      this.fish.note = (this.fish.note + 1) % FISH_NOTES.length;
      this.fish.noteTime = 0.12;
    }

    //  Gone off the far side.
    if (this.fish.x < game.gameBounds.left - margin || this.fish.x > game.gameBounds.right + margin) {
      this.fish = null;
      this.resetFishTimer();
    }
  }

  //  A shot fish's score shows for a second.
  if (this.fishScore) {
    this.fishScore.timeLeft -= dt;
    if (this.fishScore.timeLeft <= 0) {
      this.fishScore = null;
    }
  }
};

PlayState.prototype.update = function(game, dt) {

  //  If the left or right arrow keys are pressed, move
  //  the ship. Check this on ticks rather than via a keydown
  //  event for smooth movement, otherwise the ship would move
  //  more like a text editor caret.
  if (game.pressedKeys[KEY_LEFT]) {
    this.ship.x -= this.shipSpeed * dt;
  }
  if (game.pressedKeys[KEY_RIGHT]) {
    this.ship.x += this.shipSpeed * dt;
  }

  //  A touch drag moves the ship's target and the ship follows it closely, up
  //  to touchShipSpeed. Lifting your finger stops the ship where it is.
  if (!game.touch) {
    this.shipTargetX = null;
    game.touchDrag = 0;
  } else if (game.touchDrag) {
    var from = this.shipTargetX === null ? this.ship.x : this.shipTargetX;
    this.shipTargetX = Math.min(Math.max(from + game.touchDrag, game.gameBounds.left), game.gameBounds.right);
    game.touchDrag = 0;
  }
  if (this.shipTargetX !== null) {
    var step = this.config.touchShipSpeed * dt;
    var gap = this.shipTargetX - this.ship.x;
    if (Math.abs(gap) <= step) {
      this.ship.x = this.shipTargetX;
      this.shipTargetX = null;
    } else {
      this.ship.x += gap > 0 ? step : -step;
    }
  }
  if (game.pressedKeys[KEY_SPACE]) {
    this.fireRocket();
  }

  //  Keep the ship in bounds.
  if (this.ship.x < game.gameBounds.left) {
    this.ship.x = game.gameBounds.left;
  }
  if (this.ship.x > game.gameBounds.right) {
    this.ship.x = game.gameBounds.right;
  }

  //  Move each bomb. One that hits a shield blasts a hole in it and stops.
  for (var i = 0; i < this.bombs.length; i++) {
    var bomb = this.bombs[i];
    var bombFront = bomb.y + 2;
    bomb.y += dt * bomb.velocity;
    var bombHit = this.shieldHit(bomb.x, bombFront, bomb.y + 2);
    if (bombHit) {
      bombHit.shield.blast(bomb.x, bombHit.y);
      this.bombs.splice(i--, 1);
    } else if (bomb.y > game.height) {
      //  It's gone off the screen.
      this.bombs.splice(i--, 1);
    }
  }

  //  Move each rocket. Your own shots blast holes in shields too.
  for (i = 0; i < this.rockets.length; i++) {
    var rocket = this.rockets[i];
    var rocketFront = rocket.y - 2;
    rocket.y -= dt * rocket.velocity;
    var rocketHit = this.shieldHit(rocket.x + 0.5, rocketFront, rocket.y - 2);
    if (rocketHit) {
      rocketHit.shield.blast(rocket.x + 0.5, rocketHit.y);
      this.rockets.splice(i--, 1);
    } else if (rocket.y < 0) {
      //  It's gone off the screen.
      this.rockets.splice(i--, 1);
    }
  }

  //  Move the invaders, faster the fewer are left. A drop stops at exactly
  //  invaderDropDistance, however fast the fleet is going.
  var speedUp = this.fleetSpeedUp();
  var dx = this.invaderVelocity.x * speedUp * dt;
  var dy = this.invaderVelocity.y * speedUp * dt;
  if (this.invadersAreDropping) {
    dy = Math.min(dy, this.config.invaderDropDistance - this.invaderCurrentDropDistance);
  }
  var hitLeft = false, hitRight = false, hitBottom = false;
  for (i = 0; i < this.invaders.length; i++) {
    var invader = this.invaders[i];
    var newx = invader.x + dx;
    var newy = invader.y + dy;
    if (hitLeft == false && newx < game.gameBounds.left) {
      hitLeft = true;
    }
    else if (hitRight == false && newx > game.gameBounds.right) {
      hitRight = true;
    }
    else if (hitBottom == false && newy > game.gameBounds.bottom) {
      hitBottom = true;
    }

    if (!hitLeft && !hitRight && !hitBottom) {
      invader.x = newx;
      invader.y = newy;
    }
  }

  //  Update invader velocities.
  if (this.invadersAreDropping) {
    this.invaderCurrentDropDistance += dy;
    if (this.invaderCurrentDropDistance >= this.config.invaderDropDistance) {
      this.invadersAreDropping = false;
      this.invaderVelocity = this.invaderNextVelocity;
      this.invaderCurrentDropDistance = 0;
    }
  }
  //  If we've hit the left, move down then right.
  if (hitLeft) {
    this.invaderCurrentVelocity += this.config.invaderAcceleration;
    this.invaderVelocity = { x: 0, y: this.invaderCurrentVelocity };
    this.invadersAreDropping = true;
    this.invaderNextVelocity = { x: this.invaderCurrentVelocity, y: 0 };
  }
  //  If we've hit the right, move down then left.
  if (hitRight) {
    this.invaderCurrentVelocity += this.config.invaderAcceleration;
    this.invaderVelocity = { x: 0, y: this.invaderCurrentVelocity };
    this.invadersAreDropping = true;
    this.invaderNextVelocity = { x: -this.invaderCurrentVelocity, y: 0 };
  }
  //  If we've hit the bottom, it's game over.
  if (hitBottom) {
    game.lives = 0;
  }

  //  Invaders crush any shield they march into.
  for (i = 0; i < this.invaders.length; i++) {
    var crusher = this.invaders[i];
    for (var k = 0; k < this.shields.length; k++) {
      var crushed = this.shields[k];
      if (Math.abs(crusher.x - crushed.x) < (crusher.width + crushed.width) / 2 &&
        Math.abs(crusher.y - crushed.y) < (crusher.height + crushed.height) / 2) {
        crushed.eraseBox(crusher.x - crusher.width / 2, crusher.y - crusher.height / 2,
          crusher.x + crusher.width / 2, crusher.y + crusher.height / 2);
      }
    }
  }

  //  Each time the fleet moves a step, swap the invaders' pose so they march,
  //  and play the next heartbeat note. The faster they go, the faster both
  //  go, until steps lengthen to stay under INVADER_MAX_STEPS_PER_SECOND.
  var moved = Math.abs(dx) + Math.abs(dy);
  var step = Math.max(INVADER_STEP, moved / dt / INVADER_MAX_STEPS_PER_SECOND);
  this.invaderStepDistance += moved;
  if (this.invaderStepDistance >= step) {
    this.invaderStepDistance = 0;
    this.invaderPose = 1 - this.invaderPose;
    game.sounds.playNote(HEARTBEAT_NOTES[this.heartbeatNote], 0.12);
    this.heartbeatNote = (this.heartbeatNote + 1) % HEARTBEAT_NOTES.length;
  }

  this.updateFish(game, dt);

  if (game.messageTime > 0) {
    game.messageTime -= dt;
  }

  //  Check for a rocket hitting the fish, for its score.
  for (i = 0; this.fish && i < this.rockets.length; i++) {
    var shot = this.rockets[i];
    var fish = this.fish;
    if (shot.x >= fish.x - fish.width / 2 && shot.x <= fish.x + fish.width / 2 &&
      shot.y >= fish.y - fish.height / 2 && shot.y <= fish.y + fish.height / 2) {
      var points = FISH_POINTS[Math.floor(Math.random() * FISH_POINTS.length)];
      game.addScore(points);
      this.fishScore = { points: points, x: fish.x, y: fish.y, timeLeft: 1 };
      this.rockets.splice(i, 1);
      this.fish = null;
      this.resetFishTimer();
      game.sounds.playSound('fish');
    }
  }

  //  Check for rocket/invader collisions.
  for (i = 0; i < this.invaders.length; i++) {
    var invader = this.invaders[i];
    var bang = false;

    for (var j = 0; j < this.rockets.length; j++) {
      var rocket = this.rockets[j];

      if (rocket.x >= (invader.x - invader.width / 2) && rocket.x <= (invader.x + invader.width / 2) &&
        rocket.y >= (invader.y - invader.height / 2) && rocket.y <= (invader.y + invader.height / 2)) {

        //  Remove the rocket, set 'bang' so we don't process
        //  this rocket again.
        this.rockets.splice(j--, 1);
        bang = true;
        game.addScore(INVADER_TYPES[invader.type].points);
        break;
      }
    }
    if (bang) {
      this.invaders.splice(i--, 1);
      game.sounds.playSound('bang');
    }
  }

  //  Find all of the front rank invaders.
  var frontRankInvaders = {};
  for (var i = 0; i < this.invaders.length; i++) {
    var invader = this.invaders[i];
    //  If we have no invader for game file, or the invader
    //  for game file is futher behind, set the front
    //  rank invader to game one.
    if (!frontRankInvaders[invader.file] || frontRankInvaders[invader.file].rank < invader.rank) {
      frontRankInvaders[invader.file] = invader;
    }
  }

  //  Give each front rank invader a chance to drop a bomb, in every column.
  for (var file in frontRankInvaders) {
    var invader = frontRankInvaders[file];
    var chance = this.bombRate * dt;
    if (chance > Math.random()) {
      //  Fire!
      this.bombs.push(new Bomb(invader.x, invader.y + invader.height / 2,
        this.bombMinVelocity + Math.random() * (this.bombMaxVelocity - this.bombMinVelocity)));
    }
  }

  //  Check for bomb/ship collisions.
  for (var i = 0; i < this.bombs.length; i++) {
    var bomb = this.bombs[i];
    if (bomb.x >= (this.ship.x - this.ship.width / 2) && bomb.x <= (this.ship.x + this.ship.width / 2) &&
      bomb.y >= (this.ship.y - this.ship.height / 2) && bomb.y <= (this.ship.y + this.ship.height / 2)) {
      this.bombs.splice(i--, 1);
      game.loseCat();
    }

  }

  //  Check for invader/ship collisions.
  for (var i = 0; i < this.invaders.length; i++) {
    var invader = this.invaders[i];
    if ((invader.x + invader.width / 2) > (this.ship.x - this.ship.width / 2) &&
      (invader.x - invader.width / 2) < (this.ship.x + this.ship.width / 2) &&
      (invader.y + invader.height / 2) > (this.ship.y - this.ship.height / 2) &&
      (invader.y - invader.height / 2) < (this.ship.y + this.ship.height / 2)) {
      //  The fleet has reached your cat, and that's the game.
      game.lives = 0;
      game.sounds.playSound('meow');
      break;
    }
  }

  //  Check for failure
  if (game.lives <= 0) {
    game.moveToState(new GameOverState());
  }

  //  Check for victory
  if (this.invaders.length === 0) {
    game.addScore(this.level * 50);
    game.level += 1;
    game.moveToState(new LevelIntroState(game.level));
  }
};

PlayState.prototype.draw = function(game, dt, ctx) {

  //  Clear the background.
  ctx.clearRect(0, 0, game.width, game.height);

  //  Scale the pixel art up without blurring it, lined up with whole screen
  //  pixels so it doesn't shimmer as it moves.
  var pixelScale = ctx.getTransform ? ctx.getTransform().a : 1;
  var snap = function(value) { return Math.round(value * pixelScale) / pixelScale; };
  ctx.imageSmoothingEnabled = false;

  //  Draw the cat that's playing. Positions are centres (collisions, rockets
  //  and bombs all use them that way), so sprites are drawn centred on them.
  var cat = game.currentCat();
  ctx.drawImage(game.catSprites[cat], snap(this.ship.x - this.ship.width / 2), snap(this.ship.y - this.ship.height / 2),
    snap(this.ship.width), snap(this.ship.height));

  for (var n = 0; n < this.shields.length; n++) {
    var shield = this.shields[n];
    ctx.drawImage(shield.sprite, snap(shield.x - shield.width / 2), snap(shield.y - shield.height / 2),
      snap(shield.width), snap(shield.height));
  }
  for (var i = 0; i < this.invaders.length; i++) {
    var invader = this.invaders[i];
    var invaderSprite = game.invaderSprites[invader.type][game.invaderColour][this.invaderPose];
    ctx.drawImage(invaderSprite, snap(invader.x - invader.width / 2), snap(invader.y - invader.height / 2),
      snap(invader.width), snap(invader.height));
  }
  var fish = this.fish;
  if (fish) {
    ctx.drawImage(game.fishSprites[fish.velocity > 0 ? 'right' : 'left'], snap(fish.x - fish.width / 2), snap(fish.y - fish.height / 2),
      snap(fish.width), snap(fish.height));
  }
  this.drawLives(game, ctx, snap);
  ctx.imageSmoothingEnabled = true;

  //  The score for a fish that's just been shot, where it was.
  if (this.fishScore) {
    ctx.font = "12px Arial";
    ctx.fillStyle = FISH_COLOUR;
    ctx.textAlign = "center";
    ctx.fillText(this.fishScore.points, this.fishScore.x, this.fishScore.y);
  }

  //  The playing cat's name, under it.
  ctx.font = "10px Arial";
  ctx.fillStyle = CATS[cat].colour;
  ctx.textAlign = "center";
  ctx.fillText(CATS[cat].name, this.ship.x, this.ship.y + this.ship.height / 2 + 9);


  //  Draw bombs.
  ctx.fillStyle = '#ff5555';
  for (var i = 0; i < this.bombs.length; i++) {
    var bomb = this.bombs[i];
    ctx.fillRect(bomb.x - 2, bomb.y - 2, 4, 4);
  }

  //  Draw rockets.
  ctx.fillStyle = '#ff0000';
  for (var i = 0; i < this.rockets.length; i++) {
    var rocket = this.rockets[i];
    ctx.fillRect(rocket.x, rocket.y - 2, 1, 4);
  }

  //  Draw info.
  var textYpos = game.gameBounds.bottom + ((game.height - game.gameBounds.bottom) / 2) + 14 / 2;
  ctx.font = "14px Arial";
  ctx.fillStyle = '#ffffff';
  //  The level on the left, the score in the middle and the high score on
  //  the right, so the three never overlap, even with six-figure scores.
  ctx.textAlign = "left";
  ctx.fillText("Level: " + game.level, game.gameBounds.left, textYpos);
  ctx.textAlign = "center";
  ctx.fillText("Score: " + game.score, game.width / 2, textYpos);
  ctx.textAlign = "right";
  ctx.fillText("High score: " + game.highScore, game.gameBounds.right, textYpos);

  //  A cat joining or floating home, across the middle.
  if (game.message && game.messageTime > 0) {
    ctx.font = "16px Arial";
    ctx.textAlign = "center";
    ctx.fillStyle = game.message.colour;
    ctx.fillText(game.message.text, game.width / 2, game.height / 2);
    ctx.fillStyle = '#ffffff';
  }

  //  If we're in debug mode, draw bounds.
  if (this.config.debugMode) {
    ctx.strokeStyle = '#ff0000';
    ctx.strokeRect(0, 0, game.width, game.height);
    ctx.strokeRect(game.gameBounds.left, game.gameBounds.top,
      game.gameBounds.right - game.gameBounds.left,
      game.gameBounds.bottom - game.gameBounds.top);
  }

};

//  The lives along the bottom: the cats waiting their turn, then in grey the
//  bonus cats still to come, each with the score that brings it in.
PlayState.prototype.drawLives = function(game, ctx, snap) {
  var order = game.catOrder();
  var inGame = game.startCats() + game.bonusCats;
  var last = game.startCats() + game.maxBonusCats();
  var width = CAT_FACES.plain[0].length * INVADER_PIXEL_SIZE;
  var height = CAT_FACES.plain.length * INVADER_PIXEL_SIZE;
  var x = game.gameBounds.left;
  var y = game.gameBounds.bottom + 42;
  for (var i = game.catsLost + 1; i < last; i++) {
    var waiting = i >= inGame;
    var sprite = (waiting ? game.waitingCatSprites : game.catSprites)[order[i]];
    ctx.drawImage(sprite, snap(x), snap(y - height / 2), snap(width), snap(height));
    if (waiting) {
      var score = game.config.bonusCatScores[i - game.startCats()];
      ctx.font = "10px Arial";
      ctx.fillStyle = '#6b7280';
      ctx.textAlign = "center";
      ctx.fillText(score % 1000 === 0 ? (score / 1000) + 'K' : score, x + width / 2, y + height / 2 + 8);
    }
    x += width + 10;
  }
};

PlayState.prototype.keyDown = function(game, keyCode) {

  if (keyCode == KEY_SPACE) {
    //  Fire!
    this.fireRocket();
  }
  if (keyCode == 80) {
    //  Push the pause state.
    game.pushState(new PauseState());
  }
};

PlayState.prototype.keyUp = function(game, keyCode) {

};

PlayState.prototype.fireRocket = function() {
  //  If we have no last rocket time, or the last rocket time 
  //  is older than the max rocket rate, we can fire.
  if (this.lastRocketTime === null || ((new Date()).valueOf() - this.lastRocketTime) > (1000 / this.rocketMaxFireRate)) {
    //  Add a rocket.
    this.rockets.push(new Rocket(this.ship.x, this.ship.y - 12, this.config.rocketVelocity));
    this.lastRocketTime = (new Date()).valueOf();

    //  Play the 'shoot' sound.
    game.sounds.playSound('shoot');
  }
};

function PauseState() {

}

PauseState.prototype.keyDown = function(game, keyCode) {

  if (keyCode == 80) {
    //  Pop the pause state.
    game.popState();
  }
};

PauseState.prototype.draw = function(game, dt, ctx) {

  //  Clear the background.
  ctx.clearRect(0, 0, game.width, game.height);

  ctx.font = "14px Arial";
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText("Paused", game.width / 2, game.height / 2);
  if (game.touchMode) {
    ctx.fillText("Tap to resume.", game.width / 2, game.height / 2 + 24);
  }
  return;
};

/*  
    Level Intro State

    The Level Intro state shows a 'Level X' message and
    a countdown for the level.
*/
function LevelIntroState(level) {
  this.level = level;
  this.countdownMessage = "3";
}

LevelIntroState.prototype.update = function(game, dt) {

  //  Update the countdown.
  if (this.countdown === undefined) {
    this.countdown = 3; // countdown from 3 secs
  }
  this.countdown -= dt;
  if (this.countdown < 2) {
    this.countdownMessage = "2";
  }
  if (this.countdown < 1) {
    this.countdownMessage = "1";
  }
  if (this.countdown <= 0) {
    //  Move to the next level, popping this state.
    game.moveToState(new PlayState(game.config, this.level));
  }
};

LevelIntroState.prototype.draw = function(game, dt, ctx) {

  //  Clear the background.
  ctx.clearRect(0, 0, game.width, game.height);

  ctx.font = "36px Arial";
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText("Level " + this.level, game.width / 2, game.height / 2);
  ctx.font = "24px Arial";
  ctx.fillText("Ready in " + this.countdownMessage, game.width / 2, game.height / 2 + 36);
  return;
};


/*

  Ship

  Your cat. It has a position and a size, and the game draws whichever cat
  is playing there.

*/

function Ship(x, y) {
  this.x = x;
  this.y = y;
  this.width = CAT_FACES.plain[0].length * CAT_PIXEL_SIZE;
  this.height = CAT_FACES.plain.length * CAT_PIXEL_SIZE;
}

/*
    Rocket

    Fired by the ship, they've got a position, velocity and state.

    */
function Rocket(x, y, velocity) {
  this.x = x;
  this.y = y;
  this.velocity = velocity;
}

/*
    Bomb

    Dropped by invaders, they've got position, velocity.

*/
function Bomb(x, y, velocity) {
  this.x = x;
  this.y = y;
  this.velocity = velocity;
}

/*
    Invader 

    Invader's have position, type, rank/file and that's about it. 
*/

function Invader(x, y, rank, file, type) {
  this.x = x;
  this.y = y;
  this.rank = rank;
  this.file = file;
  this.type = type;

  //  Sized from its pixel grid, so rat knights are narrower than bats.
  var pixels = INVADER_TYPES[type].poses[0];
  this.width = pixels[0].length * INVADER_PIXEL_SIZE;
  this.height = pixels.length * INVADER_PIXEL_SIZE;
}

/*
    Shield

    A moon rock that wears away. It keeps which of its pixels are left, and
    its own small canvas to draw, which loses those pixels too.
*/
function Shield(x, y) {
  this.x = x;
  this.y = y;
  this.width = SHIELD_PIXELS[0].length * INVADER_PIXEL_SIZE;
  this.height = SHIELD_PIXELS.length * INVADER_PIXEL_SIZE;
  this.pixels = SHIELD_PIXELS.map(function(row) {
    return row.split('').map(function(pixel) { return pixel === '#'; });
  });
  this.sprite = drawPixelSprite(SHIELD_PIXELS, SHIELD_COLOUR);
}

//  The grid column and row at a point in the game.
Shield.prototype.columnAt = function(x) {
  return Math.floor((x - (this.x - this.width / 2)) / INVADER_PIXEL_SIZE);
};
Shield.prototype.rowAt = function(y) {
  return Math.floor((y - (this.y - this.height / 2)) / INVADER_PIXEL_SIZE);
};

//  Whether there's any shield left at a point in the game.
Shield.prototype.isSolidAt = function(x, y) {
  var row = this.pixels[this.rowAt(y)];
  return !!(row && row[this.columnAt(x)]);
};

//  Knocks out one pixel, if it's still there.
Shield.prototype.erasePixel = function(column, row) {
  if (this.pixels[row] && this.pixels[row][column]) {
    this.pixels[row][column] = false;
    this.sprite.getContext('2d').clearRect(column, row, 1, 1);
  }
};

//  Blows a ragged hole where a shot or bomb hits.
Shield.prototype.blast = function(x, y) {
  var column = this.columnAt(x);
  var row = this.rowAt(y);
  for (var dy = -2; dy <= 2; dy++) {
    for (var dx = -2; dx <= 2; dx++) {
      var distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= 1.5 || (distance <= 2.5 && Math.random() < 0.5)) {
        this.erasePixel(column + dx, row + dy);
      }
    }
  }
};

//  Crushes the part of the shield under a box, such as an invader passing
//  through it.
Shield.prototype.eraseBox = function(left, top, right, bottom) {
  for (var row = Math.max(0, this.rowAt(top)); row <= Math.min(this.pixels.length - 1, this.rowAt(bottom)); row++) {
    for (var column = Math.max(0, this.columnAt(left)); column <= Math.min(this.pixels[0].length - 1, this.columnAt(right)); column++) {
      this.erasePixel(column, row);
    }
  }
};

/*
    Fish

    The fish swims straight across the top at a steady speed.
*/
function Fish(x, y, velocity) {
  this.x = x;
  this.y = y;
  this.velocity = velocity;
  this.width = FISH_PIXELS[0].length * INVADER_PIXEL_SIZE;
  this.height = FISH_PIXELS.length * INVADER_PIXEL_SIZE;

  //  Which note of its bubbling is next, and how long until it plays.
  this.note = 0;
  this.noteTime = 0;
}

//  Draws a pixel grid (an invader pose, the fish or a cat) in the given
//  colour onto a small canvas, one canvas pixel per grid pixel. Each is drawn
//  once and scaled up when the game draws.
function drawPixelSprite(pixels, colour) {
  var sprite = document.createElement('canvas');
  sprite.width = pixels[0].length;
  sprite.height = pixels.length;
  var ctx = sprite.getContext('2d');
  for (var y = 0; y < pixels.length; y++) {
    for (var x = 0; x < pixels[y].length; x++) {
      var pixel = pixels[y].charAt(x);
      if (pixel !== '.') {
        ctx.fillStyle = pixel === 'o' ? '#000000' : colour;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  return sprite;
}


/*
    Game State

    A Game State is simply an update and draw proc.
    When a game is in the state, the update and draw procs are
    called, with a dt value (dt is delta time, i.e. the number)
    of seconds to update or draw).

*/
function GameState(updateProc, drawProc, keyDown, keyUp, enter, leave) {
  this.updateProc = updateProc;
  this.drawProc = drawProc;
  this.keyDown = keyDown;
  this.keyUp = keyUp;
  this.enter = enter;
  this.leave = leave;
}

/*

    Sounds

    Every sound is made in code with the Web Audio API, so there are no
    sound files to load.

*/
function Sounds() {

  //  The audio context.
  this.audioContext = null;

  //  A second of white noise, for the pops.
  this.noise = null;
}

Sounds.prototype.init = function() {

  //  Create the audio context, paying attention to webkit browsers.
  var context = window.AudioContext || window.webkitAudioContext;
  this.audioContext = new context();
  this.mute = false;

  var length = this.audioContext.sampleRate;
  this.noise = this.audioContext.createBuffer(1, length, length);
  var samples = this.noise.getChannelData(0);
  for (var i = 0; i < length; i++) {
    samples[i] = Math.random() * 2 - 1;
  }
};

//  Browsers, iPhones especially, keep audio switched off until the player
//  interacts with the page, so call this from an input event.
Sounds.prototype.unlock = function() {
  if (this.audioContext.state === 'suspended') {
    this.audioContext.resume();
  }
};

//  Whether sounds can play now. They're skipped while sound is off, so they
//  can't pile up and all play at once when it comes back on.
Sounds.prototype.canPlay = function() {
  return this.mute !== true && this.audioContext.state === 'running';
};

//  Plays a short note, for the fleet's footsteps, the fish's bubbling and
//  the tunes. The volume, and a delay in seconds before it starts, are
//  optional.
Sounds.prototype.playNote = function(frequency, duration, level, delay) {
  var context = this.audioContext;
  level = level || 0.15;
  if (!this.canPlay()) {
    return;
  }

  //  A square wave with a quick start, held for half the note, then faded,
  //  so it thumps rather than clicks.
  var oscillator = context.createOscillator();
  var volume = context.createGain();
  var now = context.currentTime + (delay || 0);
  oscillator.type = 'square';
  oscillator.frequency.value = frequency;
  volume.gain.setValueAtTime(0.0001, now);
  volume.gain.exponentialRampToValueAtTime(level, now + 0.005);
  volume.gain.setValueAtTime(level, now + duration / 2);
  volume.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(volume);
  volume.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
};

//  Plays one of the game's sound effects, by name.
Sounds.prototype.playSound = function(name) {
  if (!this.canPlay()) {
    return;
  }
  switch (name) {
    case 'shoot':
      //  A short, high zap that drops in pitch.
      this.sweep(1400, 350, 0.08, 0.05);
      break;
    case 'bang':
      //  An invader popping: a burst of noise that dulls as it fades.
      this.pop(0.15, 0.3);
      break;
    case 'fish':
      //  Two bright notes going up.
      this.playNote(1047, 0.08, 0.06);
      this.playNote(1568, 0.12, 0.06, 0.08);
      break;
    case 'join':
      //  A cat joining: four notes climbing.
      var notes = [784, 988, 1175, 1568];
      for (var i = 0; i < notes.length; i++) {
        this.playNote(notes[i], 0.1, 0.06, i * 0.07);
      }
      break;
    case 'meow':
      //  A cat floating home.
      this.meow();
      break;
  }
};

//  A square wave sliding from one pitch to another as it fades.
Sounds.prototype.sweep = function(from, to, duration, level) {
  var context = this.audioContext;
  var now = context.currentTime;
  var oscillator = context.createOscillator();
  var volume = context.createGain();
  oscillator.type = 'square';
  oscillator.frequency.setValueAtTime(from, now);
  oscillator.frequency.exponentialRampToValueAtTime(to, now + duration);
  volume.gain.setValueAtTime(level, now);
  volume.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(volume);
  volume.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
};

//  A burst of noise through a filter that closes as it fades.
Sounds.prototype.pop = function(duration, level) {
  var context = this.audioContext;
  var now = context.currentTime;
  var source = context.createBufferSource();
  var filter = context.createBiquadFilter();
  var volume = context.createGain();
  source.buffer = this.noise;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(3000, now);
  filter.frequency.exponentialRampToValueAtTime(200, now + duration);
  volume.gain.setValueAtTime(level, now);
  volume.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  source.connect(filter);
  filter.connect(volume);
  volume.connect(context.destination);
  source.start(now);
  source.stop(now + duration);
};

//  A little meow: a buzzy tone that rises and falls, with a filter that
//  opens and closes with it to make the "ow".
Sounds.prototype.meow = function() {
  var context = this.audioContext;
  var now = context.currentTime;
  var oscillator = context.createOscillator();
  var filter = context.createBiquadFilter();
  var volume = context.createGain();
  oscillator.type = 'sawtooth';
  oscillator.frequency.setValueAtTime(500, now);
  oscillator.frequency.linearRampToValueAtTime(800, now + 0.12);
  oscillator.frequency.exponentialRampToValueAtTime(380, now + 0.5);
  filter.type = 'lowpass';
  filter.Q.value = 4;
  filter.frequency.setValueAtTime(900, now);
  filter.frequency.linearRampToValueAtTime(2200, now + 0.12);
  filter.frequency.exponentialRampToValueAtTime(700, now + 0.5);
  volume.gain.setValueAtTime(0.0001, now);
  volume.gain.exponentialRampToValueAtTime(0.12, now + 0.04);
  volume.gain.setValueAtTime(0.12, now + 0.3);
  volume.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
  oscillator.connect(filter);
  filter.connect(volume);
  volume.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.5);
};
