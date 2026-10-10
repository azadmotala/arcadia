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

  //  Every way into a game takes the board along, in case this device can't
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

    var made = document.getElementById('made');
    var linkText = document.getElementById('boardLink');
    var status = document.getElementById('copied');
    var shareButton = document.getElementById('shareLink');
    shareButton.hidden = !navigator.share;

    document.getElementById('makeBoard').addEventListener('submit', function(e) {
      e.preventDefault();
      var code = makeCode(document.getElementById('boardName').value);
      saveBoard(code);
      showCurrent(code);
      linkText.textContent = boardLink(code);
      status.textContent = '';
      made.hidden = false;
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
      navigator.share({
        title: 'Arcadia',
        text: 'Join our leaderboard on Arcadia.',
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

  //  Lights the dot for whichever slide is across the middle of the screen.
  function setUpDots() {
    if (!('IntersectionObserver' in window)) {
      return;
    }
    var dots = document.querySelectorAll('.dots a');
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
})();
