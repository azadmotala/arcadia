/*
  arcadia.js

  The home page, apart from the 3D scene (see scene.js): the family board
  maker, the cats in the Space Cats cabinet, and cabinets that lean towards
  the pointer.
*/

(function() {

  //  Family boards. A board is a private code that every Arcadia game
  //  shares, kept on this device under the same name the games use.
  var BOARD_KEY = 'arcadia.board';
  var BOARD_PATTERN = /^[A-Za-z0-9-]{6,40}$/;
  var GAME_URL = 'games/space-cats/';

  //  Saved as JSON, the way the games save it. Earlier versions of this page
  //  saved the bare code, so that's read too.
  function loadBoard() {
    try {
      var board = window.localStorage.getItem(BOARD_KEY);
      try {
        board = JSON.parse(board);
      } catch (e) {
        //  The bare code.
      }
      return typeof board === 'string' && BOARD_PATTERN.test(board) ? board : null;
    } catch (e) {
      return null;
    }
  }

  function saveBoard(board) {
    try {
      window.localStorage.setItem(BOARD_KEY, JSON.stringify(board));
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

  //  A board's name, from its code: "friday-night-crew-7e3xkq" is "Friday
  //  night crew". A board made without a name, or a code someone made up,
  //  has none. The games work it out the same way (see leaderboard.js).
  function boardName(board) {
    var match = /^(.+)-[a-km-z2-9]{6}$/.exec(board || '');
    if (!match) {
      return null;
    }
    var words = match[1].replace(/-+/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  //  The link to send: this page with the board on the end.
  function boardLink(board) {
    var page = window.location.origin + window.location.pathname.replace(/index\.html$/, '');
    return page + '?board=' + encodeURIComponent(board);
  }

  //  Every way into a game takes the board along, in case this device can't
  //  remember it.
  function updatePlayLinks(board) {
    var links = document.querySelectorAll('.play-link');
    for (var i = 0; i < links.length; i++) {
      links[i].href = GAME_URL + (board ? '?board=' + encodeURIComponent(board) : '');
    }
  }

  //  Writes "before <name> after" into an element, with the board's name in
  //  bold, or its code if it has no name.
  function sayBoard(element, before, board, after) {
    var name = boardName(board);
    var part = document.createElement(name ? 'strong' : 'code');
    part.textContent = name || board;
    element.textContent = '';
    element.appendChild(document.createTextNode(before));
    element.appendChild(part);
    element.appendChild(document.createTextNode(after));
  }

  //  The panel for the board this device is on: what it's called, its link
  //  to copy or share, and a way to play on it. Once there's a board, the
  //  form below it makes a new one instead.
  function showCurrent(board, justMade) {
    document.getElementById('current').hidden = !board;
    document.getElementById('copied').textContent = '';
    if (board) {
      var message = document.getElementById('currentMessage');
      if (justMade) {
        sayBoard(message, 'Your board, ', board, ', is ready. Send this link to everyone who should be on it:');
      } else {
        sayBoard(message, 'This device is on ', board, '. Send this link to anyone else who should be on it:');
      }
      document.getElementById('boardLink').textContent = boardLink(board);
      document.getElementById('boardNameLabel').textContent = 'New board name';
      document.getElementById('makeButton').textContent = 'Make a new board';
    }
    //  On a board, the how-to steps matter less, and the form is folded away
    //  until asked for.
    document.getElementById('boards').classList.toggle('has-board', !!board);
    document.getElementById('makeBoard').hidden = !!board;
    document.getElementById('newBoard').hidden = !board;
    document.getElementById('newBoard').setAttribute('aria-expanded', 'false');
    updatePlayLinks(board);
  }

  function setUpBoards() {
    var fromLink = new URLSearchParams(window.location.search).get('board');
    var board = null;
    if (fromLink && BOARD_PATTERN.test(fromLink)) {
      board = fromLink;
      saveBoard(board);
      var invite = document.getElementById('invite');
      sayBoard(invite, "You're on ", board, '. Your best scores go on it.');
      invite.hidden = false;
    } else {
      board = loadBoard();
    }
    showCurrent(board, false);

    var linkText = document.getElementById('boardLink');
    var status = document.getElementById('copied');
    var shareButton = document.getElementById('shareLink');
    shareButton.hidden = !navigator.share;

    document.getElementById('makeBoard').addEventListener('submit', function(e) {
      e.preventDefault();
      var code = makeCode(document.getElementById('boardName').value);
      saveBoard(code);
      showCurrent(code, true);
      document.getElementById('boardName').value = '';
    });

    document.getElementById('newBoard').addEventListener('click', function() {
      document.getElementById('makeBoard').hidden = false;
      this.hidden = true;
      this.setAttribute('aria-expanded', 'true');
      document.getElementById('boardName').focus();
    });

    document.getElementById('copyLink').addEventListener('click', function() {
      var failed = function() {
        status.textContent = "Couldn't copy it. Select the link and copy it yourself.";
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(linkText.textContent).then(function() {
          status.textContent = 'Link copied.';
        }, failed);
      } else {
        failed();
      }
    });

    shareButton.addEventListener('click', function() {
      var name = boardName(new URL(linkText.textContent).searchParams.get('board'));
      navigator.share({
        title: 'Arcadia',
        text: name ? 'Join ' + name + ' on Arcadia.' : 'Join our leaderboard on Arcadia.',
        url: linkText.textContent
      }).catch(function() {
        //  Closing the share sheet isn't an error worth showing.
      });
    });
  }

  //  The five cats, each in its own colour, in the Space Cats cabinet.
  function setUpCats() {
    var list = document.getElementById('cats');
    CATS.forEach(function(cat) {
      var item = document.createElement('span');
      item.setAttribute('role', 'listitem');
      item.textContent = cat.name;
      item.style.color = cat.colour;
      list.appendChild(item);
    });
  }

  //  Cabinets lean towards the pointer, unless the device asks for less
  //  motion.
  function setUpCabinets() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    var cabinets = document.querySelectorAll('.cabinet');
    for (var i = 0; i < cabinets.length; i++) {
      (function(cabinet) {
        cabinet.addEventListener('pointermove', function(e) {
          var r = cabinet.getBoundingClientRect();
          var x = (e.clientX - r.left) / r.width - 0.5;
          var y = (e.clientY - r.top) / r.height - 0.5;
          cabinet.style.transform = 'rotateY(' + (x * 10).toFixed(2) + 'deg) rotateX(' + (-y * 10).toFixed(2) + 'deg) translateZ(10px)';
        });
        cabinet.addEventListener('pointerleave', function() {
          cabinet.style.transform = '';
        });
      })(cabinets[i]);
    }
  }

  //  Lights the dot, and the header link, for whichever slide is across the
  //  middle of the screen.
  function setUpDots() {
    if (!('IntersectionObserver' in window)) {
      return;
    }
    var dots = document.querySelectorAll('.dots a, .nav ul a[href^="#"]');
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (!entry.isIntersecting) {
          return;
        }
        for (var i = 0; i < dots.length; i++) {
          dots[i].setAttribute('aria-current', dots[i].getAttribute('href') === '#' + entry.target.id ? 'true' : 'false');
        }
      });
    }, { rootMargin: '-45% 0px -54% 0px' });
    var slides = document.querySelectorAll('.slide');
    for (var i = 0; i < slides.length; i++) {
      observer.observe(slides[i]);
    }
  }

  //  Links to a slide on this page (Pick a game, the header links, the
  //  dots). Safari on iPhone can pull the page straight back to where it was
  //  when a link jumps across snapping slides, so the snapping is switched
  //  off for the jump and back on once the page has settled.
  function setUpJumps() {
    var root = document.documentElement;
    var settle = null;
    document.addEventListener('click', function(e) {
      var link = e.target.closest ? e.target.closest('a[href^="#"]') : null;
      var target = link ? document.getElementById(link.getAttribute('href').slice(1)) : null;
      if (!target) {
        return;
      }
      e.preventDefault();
      var smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var top = target.getBoundingClientRect().top + window.scrollY;
      root.style.scrollSnapType = 'none';
      window.scrollTo({ top: top, behavior: smooth ? 'smooth' : 'auto' });

      //  Put the snapping back once the page reaches the slide. If something
      //  stops the smooth scroll on the way, finish the jump after two
      //  seconds instead of leaving the page between slides.
      window.clearInterval(settle);
      var waited = 0;
      settle = window.setInterval(function() {
        waited += 50;
        var arrived = Math.abs(window.scrollY - top) < 2;
        if (arrived || waited >= 2000) {
          window.clearInterval(settle);
          if (!arrived) {
            //  Stop the stuck smooth scroll where it is, then jump.
            window.scrollTo(0, window.scrollY);
            window.scrollTo(0, top);
          }
          root.style.scrollSnapType = '';
          //  A slide taller than the screen can snap to its bottom edge when
          //  the snapping comes back, so settle on its top.
          window.requestAnimationFrame(function() {
            if (Math.abs(window.scrollY - top) >= 2) {
              window.scrollTo(0, top);
            }
          });
        }
      }, 50);
    });
  }

  //  The header is see-through over the scene, and darkens once you scroll.
  function setUpHeader() {
    var header = document.querySelector('.site-header');
    var update = function() {
      header.classList.toggle('solid', window.scrollY > 24);
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  //  The page's version, read from the ?v= on this script's link in
  //  index.html, goes in the footer. GitHub Pages can serve the old page for
  //  a few minutes after a release, so it shows which one a phone has.
  function setUpVersion() {
    var script = document.currentScript;
    var match = script && /[?&]v=([^&]+)/.exec(script.src);
    if (match) {
      document.getElementById('version').textContent = match[1];
    }
  }

  //  If the 3D scene hasn't started after a few seconds (no WebGL, or
  //  three.js couldn't load), show the name on its own instead.
  window.setTimeout(function() {
    if (!window.arcadiaScene) {
      document.documentElement.classList.add('no-webgl');
    }
  }, 6000);

  setUpBoards();
  setUpCats();
  setUpCabinets();
  setUpDots();
  setUpHeader();
  setUpJumps();
  setUpVersion();
})();
