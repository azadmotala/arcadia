/*
  arcadia.js

  The home page: the family board maker, the row of cats, and the attract
  screen behind the name, where the Space Cats fleet marches and a cat
  shoots at it. The sprites come from games/space-cats/js/spacecats.js.
*/

(function() {

  //  Family boards. A board is a private code that every Arcadia game
  //  shares, kept on this device under the same name the games use.
  var BOARD_KEY = 'arcadia.board';
  var BOARD_PATTERN = /^[A-Za-z0-9-]{6,40}$/;
  var GAME_URL = 'games/space-cats/';

  function loadBoard() {
    try {
      var board = window.localStorage.getItem(BOARD_KEY);
      return board && BOARD_PATTERN.test(board) ? board : null;
    } catch (e) {
      return null;
    }
  }

  function saveBoard(board) {
    try {
      window.localStorage.setItem(BOARD_KEY, board);
    } catch (e) {
      //  Storage is blocked; the play links still carry the board.
    }
  }

  //  A board code from a name: the name in lower case with dashes, then a
  //  few random letters and numbers so it can't be guessed.
  function makeCode(name) {
    var slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
    var letters = 'abcdefghijkmnpqrstuvwxyz23456789';
    var bytes = new Uint8Array(slug ? 6 : 10);
    window.crypto.getRandomValues(bytes);
    var suffix = '';
    for (var i = 0; i < bytes.length; i++) {
      suffix += letters.charAt(bytes[i] % letters.length);
    }
    return slug ? slug + '-' + suffix : 'board-' + suffix;
  }

  //  The link to send: this page with the board on the end.
  function boardLink(board) {
    var page = window.location.origin + window.location.pathname.replace(/index\.html$/, '');
    return page + '?board=' + encodeURIComponent(board);
  }

  //  Every Play button takes the board along, in case this device can't
  //  remember it.
  function updatePlayLinks(board) {
    var links = document.querySelectorAll('.play-link');
    for (var i = 0; i < links.length; i++) {
      links[i].href = GAME_URL + (board ? '?board=' + encodeURIComponent(board) : '');
    }
  }

  function showCurrent(board) {
    document.getElementById('current').hidden = !board;
    document.getElementById('currentCode').textContent = board || '';
    updatePlayLinks(board);
  }

  function setUpBoards() {
    var fromLink = new URLSearchParams(window.location.search).get('board');
    var board = null;
    if (fromLink && BOARD_PATTERN.test(fromLink)) {
      board = fromLink;
      saveBoard(board);
      var invite = document.getElementById('invite');
      invite.textContent = "You're on the board " + board + '. Your best scores go on it.';
      invite.hidden = false;
    } else {
      board = loadBoard();
    }
    showCurrent(board);

    var form = document.getElementById('makeBoard');
    var made = document.getElementById('made');
    var linkText = document.getElementById('boardLink');
    var status = document.getElementById('copied');
    var shareButton = document.getElementById('shareLink');
    shareButton.hidden = !navigator.share;

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var code = makeCode(document.getElementById('boardName').value);
      saveBoard(code);
      showCurrent(code);
      linkText.textContent = boardLink(code);
      status.textContent = '';
      made.hidden = false;
    });

    document.getElementById('copyLink').addEventListener('click', function() {
      var link = linkText.textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(function() {
          status.textContent = 'Link copied.';
        }, function() {
          status.textContent = "Couldn't copy it. Select the link and copy it yourself.";
        });
      } else {
        status.textContent = "Couldn't copy it. Select the link and copy it yourself.";
      }
    });

    shareButton.addEventListener('click', function() {
      navigator.share({
        title: 'Arcadia',
        text: 'Join our leaderboard on Arcadia.',
        url: linkText.textContent
      }).catch(function() {
        //  Closing the share sheet isn't an error worth showing.
      });
    });
  }

  //  The five cats, each in its own colour, under the game's description.
  function setUpRoster() {
    var roster = document.getElementById('roster');
    CATS.forEach(function(cat) {
      var item = document.createElement('li');
      var sprite = drawPixelSprite(CAT_FACES[cat.face], cat.colour);
      sprite.setAttribute('aria-hidden', 'true');
      var name = document.createElement('span');
      name.textContent = cat.name;
      name.style.color = cat.colour;
      item.appendChild(sprite);
      item.appendChild(name);
      roster.appendChild(item);
    });
  }

  //  The attract screen: the fleet marches side to side in steps, a cat
  //  slides underneath and picks them off, and a fish swims by now and then.
  function setUpAttract() {
    var canvas = document.getElementById('attract');
    var hero = canvas.parentNode;
    var heroText = hero.querySelector('.hero-text');
    var ctx = canvas.getContext('2d');
    var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var types = ['mouse', 'rat', 'bat'];
    var sprites = {};
    types.forEach(function(type) {
      sprites[type] = INVADER_TYPES[type].poses.map(function(pose) { return drawPixelSprite(pose, SHIELD_COLOUR); });
    });
    var fishRight = drawPixelSprite(FISH_PIXELS.map(function(row) { return row.split('').reverse().join(''); }), FISH_COLOUR);
    var fishLeft = drawPixelSprite(FISH_PIXELS, FISH_COLOUR);
    var catSprites = CATS.map(function(cat) { return drawPixelSprite(CAT_FACES[cat.face], cat.colour); });

    var width, height, px, fleet, fleetX, fleetY, fleetWidth, direction, pose;
    var stars = [], cat, shot, fish, pops, catIndex = 0;
    var stepTimer = 0, fishTimer = 6, resetTimer = 0, last = 0;

    function layout() {
      var ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = hero.clientWidth;
      height = hero.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.imageSmoothingEnabled = false;
      //  The fleet and the cat fit in the band above the text.
      var band = heroText.offsetTop;
      px = band >= 260 ? 4 : 3;
      stars = [];
      for (var i = 0; i < Math.round(width * height / 9000); i++) {
        stars.push({ x: Math.random() * width, y: Math.random() * height, phase: Math.random() * 6.3 });
      }
      newFleet();
      var catY = band - 12 * px;
      cat = catY > fleetY + 44 * px ? { x: width / 2, y: catY, target: width / 2 } : null;
      shot = null;
      pops = [];
      draw(0);
    }

    function newFleet() {
      var columns = Math.max(4, Math.min(11, Math.floor(width * 0.72 / (16 * px))));
      fleet = [];
      types.forEach(function(type, row) {
        for (var column = 0; column < columns; column++) {
          fleet.push({ type: type, column: column, row: row, alive: true });
        }
      });
      fleetWidth = columns * 16 * px;
      fleetX = (width - fleetWidth) / 2;
      fleetY = 10 * px;
      direction = 1;
      pose = 0;
    }

    function invaderBox(invader) {
      var sprite = sprites[invader.type][0];
      var w = sprite.width * px;
      var h = sprite.height * px;
      var x = fleetX + invader.column * 16 * px + (16 * px - w) / 2;
      var y = fleetY + invader.row * 13 * px + (10 * px - h) / 2;
      return { x: x, y: y, w: w, h: h };
    }

    function update(dt) {
      //  The fleet takes a step every so often, and turns at the edges.
      stepTimer -= dt;
      if (stepTimer <= 0) {
        stepTimer = 0.45;
        pose = 1 - pose;
        var margin = 2 * px;
        fleetX += direction * 2 * px;
        if (fleetX + fleetWidth > width - margin || fleetX < margin) {
          direction = -direction;
          fleetX += direction * 4 * px;
        }
      }

      //  The cat heads for a column that still has someone in it, and fires
      //  once it's underneath.
      var alive = fleet.filter(function(invader) { return invader.alive; });
      if (cat) {
        if (!shot && alive.length && Math.abs(cat.x - cat.target) < px) {
          shot = { x: cat.x, y: cat.y - 6 * px };
          var next = alive[Math.floor(Math.random() * alive.length)];
          var box = invaderBox(next);
          cat.target = box.x + box.w / 2;
        }
        var speed = 90 * dt * px / 3;
        cat.x += Math.max(-speed, Math.min(speed, cat.target - cat.x));
      }

      //  The shot flies up and knocks out the first one it meets.
      if (shot) {
        shot.y -= 260 * dt;
        for (var i = 0; i < fleet.length; i++) {
          var invader = fleet[i];
          if (!invader.alive) {
            continue;
          }
          var hit = invaderBox(invader);
          if (shot.x >= hit.x && shot.x <= hit.x + hit.w && shot.y <= hit.y + hit.h && shot.y >= hit.y) {
            invader.alive = false;
            pops.push({ x: hit.x + hit.w / 2, y: hit.y + hit.h / 2, time: 0.25 });
            shot = null;
            break;
          }
        }
        if (shot && shot.y < 0) {
          shot = null;
        }
      }

      pops = pops.filter(function(pop) { pop.time -= dt; return pop.time > 0; });

      //  When the fleet's nearly gone, a new one arrives and the next cat
      //  takes a turn.
      if (alive.length < 4) {
        resetTimer += dt;
        if (resetTimer > 1) {
          resetTimer = 0;
          newFleet();
          catIndex = (catIndex + 1) % CATS.length;
        }
      }

      //  A fish now and then, across the very top.
      fishTimer -= dt;
      if (!fish && fishTimer <= 0) {
        var fromLeft = Math.random() < 0.5;
        fish = { x: fromLeft ? -60 : width + 60, velocity: fromLeft ? 70 : -70 };
      }
      if (fish) {
        fish.x += fish.velocity * dt;
        if (fish.x < -80 || fish.x > width + 80) {
          fish = null;
          fishTimer = 10 + Math.random() * 10;
        }
      }
    }

    function draw(time) {
      ctx.clearRect(0, 0, width, height);

      stars.forEach(function(star) {
        var glow = 0.35 + 0.35 * Math.sin(star.phase + time / 900);
        ctx.fillStyle = 'rgba(190, 255, 160, ' + glow.toFixed(2) + ')';
        ctx.fillRect(Math.round(star.x), Math.round(star.y), 2, 2);
      });

      fleet.forEach(function(invader) {
        if (!invader.alive) {
          return;
        }
        var box = invaderBox(invader);
        ctx.drawImage(sprites[invader.type][pose], Math.round(box.x), Math.round(box.y), box.w, box.h);
      });

      ctx.fillStyle = '#b4ff7a';
      pops.forEach(function(pop) {
        var size = Math.round((0.3 - pop.time) * 30 * px / 3);
        ctx.fillRect(Math.round(pop.x - size), Math.round(pop.y), size * 2, px / 2);
        ctx.fillRect(Math.round(pop.x), Math.round(pop.y - size), px / 2, size * 2);
      });

      if (fish) {
        var fishSprite = fish.velocity > 0 ? fishRight : fishLeft;
        ctx.drawImage(fishSprite, Math.round(fish.x), Math.max(6, Math.round(fleetY - 10 * px)), fishSprite.width * px, fishSprite.height * px);
      }

      if (cat) {
        var catSprite = catSprites[catIndex];
        var w = catSprite.width * px;
        var h = catSprite.height * px;
        ctx.drawImage(catSprite, Math.round(cat.x - w / 2), Math.round(cat.y - h / 2), w, h);
        if (shot) {
          ctx.fillStyle = '#ff5555';
          ctx.fillRect(Math.round(shot.x), Math.round(shot.y), Math.max(1, px / 2), 3 * px);
        }
      }
    }

    function frame(time) {
      var dt = last ? Math.min((time - last) / 1000, 0.05) : 0;
      last = time;
      update(dt);
      draw(time);
      window.requestAnimationFrame(frame);
    }

    layout();
    window.addEventListener('resize', layout);
    if (!still) {
      window.requestAnimationFrame(frame);
    }
  }

  setUpBoards();
  setUpRoster();
  setUpAttract();
})();
