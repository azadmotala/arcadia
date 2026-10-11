/*
  leaderboard.js

  A shared top 10 for a family or friends, kept in Arcadia's Firebase
  project (Firestore). A board is opened with a private code in the link,
  ?board=..., which this device then remembers. Every Arcadia game uses the
  same board code, and each game keeps its own scores on that board.

  The board starts afresh every week: it shows this week's top 10 and
  crowns last week's winner, and keeps an all-time top 10 as well.

  The game never depends on it. A score that makes the board is saved on
  the device first and uploaded when the board can be reached, so playing
  offline, or while Firebase is down, only delays it.
*/

var Leaderboard = (function() {

  //  The Firebase project. These identify it and are meant to sit in web
  //  pages; what can be read and written is decided by firestore.rules.
  var API_KEY = 'AIzaSyASCSC57nc_rajcgcFivzFzxYd881g47hI';
  var PROJECT_ID = 'arcadia-63980';
  var DOCUMENTS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID + '/databases/(default)/documents';

  //  This game's name in the database. Scores live at
  //  boards/{board}/games/{GAME}/scores.
  var GAME = 'space-cats';

  var SIZE = 10;
  var TIMEOUT_MS = 8000;

  //  Every board's week starts at midnight on Monday, South African time
  //  (UTC+2). Weeks are numbered from the one that started on Monday
  //  5 January 1970, and each score is saved with the week it was played
  //  in. firestore.rules works them out the same way.
  var DAY_MS = 24 * 60 * 60 * 1000;
  var WEEK_MS = 7 * DAY_MS;
  var WEEK_ZERO_MS = Date.UTC(1970, 0, 4, 22);

  //  A score played offline can still go up after its week has ended, for
  //  three days. After that the rules turn it away.
  var LATE_MS = 3 * DAY_MS;

  //  Don't fetch the board more often than this, unless a score was added.
  var REFRESH_MS = 10000;

  //  What this device remembers. The board, initials and sign-in are shared
  //  by every Arcadia game; the rest belongs to this game.
  var KEYS = {
    board: 'arcadia.board',
    initials: 'arcadia.initials',
    auth: 'arcadia.auth',
    pending: 'arcadia.' + GAME + '.pendingScores',
    cache: 'arcadia.' + GAME + '.leaderboard',
    offered: 'arcadia.' + GAME + '.offeredHighScore',
    weekBest: 'arcadia.' + GAME + '.weekBest'
  };

  //  Storage can be blocked (private browsing, for example), so reads and
  //  writes are allowed to fail. The leaderboard then forgets between visits.
  function load(key, fallback) {
    try {
      var value = window.localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      //  Not kept between visits.
    }
  }

  //  The board's code: from the link if it has one, otherwise the one this
  //  device was given before. Early versions of the home page saved it
  //  without JSON, so a bare code is read too.
  function findBoard() {
    var match = /[?&]board=([A-Za-z0-9-]{6,40})(?:&|$)/.exec(window.location.search);
    if (match) {
      save(KEYS.board, match[1]);
      return match[1];
    }
    var saved = load(KEYS.board, null);
    if (saved === null) {
      try {
        saved = window.localStorage.getItem(KEYS.board);
      } catch (e) {
        saved = null;
      }
    }
    return typeof saved === 'string' && /^[A-Za-z0-9-]{6,40}$/.test(saved) ? saved : null;
  }

  //  The board's name, from its code: "friday-night-crew-7e3xkq" is "Friday
  //  night crew". A board made without a name, or a code someone made up,
  //  has none. The home page works it out the same way (assets/arcadia.js).
  function boardName() {
    var match = /^(.+)-[a-km-z2-9]{6}$/.exec(board || '');
    if (!match) {
      return null;
    }
    var words = match[1].replace(/-+/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  //  The week a moment falls in, by this device's clock, and when a week
  //  starts.
  function weekOf(time) {
    return Math.floor((time - WEEK_ZERO_MS) / WEEK_MS);
  }

  function thisWeek() {
    return weekOf(Date.now());
  }

  function weekStart(week) {
    return WEEK_ZERO_MS + week * WEEK_MS;
  }

  //  The week a score was played in.
  function weekPlayed(entry) {
    return weekOf(Date.parse(entry.playedAt));
  }

  var board = findBoard();

  //  The board as last fetched: this week's top 10, last week's winner and
  //  the all-time top 10. The weekly ones say which week they're for, so
  //  they can be left out once that week is over.
  var cache = load(KEYS.cache, null);
  var lists = cache && cache.board === board && cache.lists ? cache.lists : { week: null, champion: null, all: null };
  var pending = load(KEYS.pending, []);
  var status = board ? 'loading' : 'off';
  var lastRefresh = 0;
  var refreshing = null;
  var refreshAgain = false;
  var idToken = null;
  var tokenExpires = 0;

  //  Sends a request and returns its JSON reply, giving up after TIMEOUT_MS.
  //  A refusal from the server fails with its HTTP status.
  function request(url, options) {
    var controller = window.AbortController ? new AbortController() : null;
    var timer = controller ? setTimeout(function() { controller.abort(); }, TIMEOUT_MS) : null;
    if (controller) {
      options.signal = controller.signal;
    }
    return fetch(url, options).then(function(response) {
      clearTimeout(timer);
      if (!response.ok) {
        var error = new Error('HTTP ' + response.status);
        error.status = response.status;
        throw error;
      }
      return response.text().then(function(text) {
        return text ? JSON.parse(text) : null;
      });
    }, function(error) {
      clearTimeout(timer);
      throw error;
    });
  }

  function postJson(url, body, token) {
    var headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers.Authorization = 'Bearer ' + token;
    }
    return request(url, { method: 'POST', headers: headers, body: JSON.stringify(body) });
  }

  //  Signs in anonymously, which the rules require for adding a score. The
  //  same anonymous user is kept between visits by saving its refresh token.
  function signIn() {
    if (idToken && Date.now() < tokenExpires) {
      return Promise.resolve(idToken);
    }
    var saved = load(KEYS.auth, null);
    var signingIn = saved && saved.refreshToken ? renew(saved.refreshToken) : signUp();
    return signingIn.then(function(user) {
      idToken = user.idToken;
      //  Renew a minute before it runs out.
      tokenExpires = Date.now() + (Number(user.expiresIn) - 60) * 1000;
      save(KEYS.auth, { refreshToken: user.refreshToken });
      return idToken;
    });
  }

  function signUp() {
    return postJson('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + API_KEY,
      { returnSecureToken: true });
  }

  function renew(refreshToken) {
    return request('https://securetoken.googleapis.com/v1/token?key=' + API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refreshToken)
    }).then(function(reply) {
      return { idToken: reply.id_token, refreshToken: reply.refresh_token, expiresIn: reply.expires_in };
    }, function(error) {
      //  The server no longer accepts this refresh token, so start afresh.
      if (error.status === 400) {
        return signUp();
      }
      throw error;
    });
  }

  //  The board's top scores, highest first: from one week, or from all
  //  time if week is null.
  function fetchTop(week, size) {
    var query = {
      from: [{ collectionId: 'scores' }],
      orderBy: [{ field: { fieldPath: 'score' }, direction: 'DESCENDING' }],
      limit: size
    };
    if (week !== null) {
      query.where = { fieldFilter: { field: { fieldPath: 'week' }, op: 'EQUAL', value: { integerValue: String(week) } } };
    }
    return postJson(DOCUMENTS + '/boards/' + board + '/games/' + GAME + ':runQuery?key=' + API_KEY, {
      structuredQuery: query
    }).then(function(rows) {
      return rows.filter(function(row) { return row.document; }).map(function(row) {
        var fields = row.document.fields;
        return {
          id: row.document.name.split('/').pop(),
          initials: fields.initials.stringValue,
          score: Number(fields.score.integerValue),
          playedAt: fields.playedAt.timestampValue
        };
      });
    });
  }

  //  This week's top 10, last week's winner and the all-time top 10.
  function fetchLists() {
    var week = thisWeek();
    return Promise.all([fetchTop(week, SIZE), fetchTop(week - 1, 1), fetchTop(null, SIZE)]).then(function(tops) {
      return {
        week: { week: week, entries: tops[0] },
        champion: { week: week - 1, entry: tops[1][0] || null },
        all: tops[2]
      };
    });
  }

  //  Adds one score to its board. Its id was made on this device, so if an
  //  earlier try got through but its reply was lost, the server says it
  //  already exists and that counts as done.
  function upload(entry, token) {
    var url = DOCUMENTS + '/boards/' + entry.board + '/games/' + GAME + '/scores?documentId=' + entry.id + '&key=' + API_KEY;
    return postJson(url, {
      fields: {
        initials: { stringValue: entry.initials },
        score: { integerValue: String(entry.score) },
        playedAt: { timestampValue: entry.playedAt },
        week: { integerValue: String(weekPlayed(entry)) }
      }
    }, token).catch(function(error) {
      if (error.status === 409) {
        return null;
      }
      throw error;
    });
  }

  //  Uploads waiting scores, oldest first, stopping at the first failure so
  //  the rest wait for the next try. Any whose week ended too long ago to
  //  be accepted are dropped.
  function flush() {
    var open = pending.filter(function(entry) {
      return Date.now() < weekStart(weekPlayed(entry)) + WEEK_MS + LATE_MS;
    });
    if (open.length < pending.length) {
      pending = open;
      save(KEYS.pending, pending);
    }
    if (!pending.length) {
      return Promise.resolve();
    }
    return signIn().then(function(token) {
      var next = function() {
        if (!pending.length) {
          return null;
        }
        return upload(pending[0], token).then(function() {
          pending.shift();
          save(KEYS.pending, pending);
          return next();
        });
      };
      return next();
    });
  }

  //  Uploads anything waiting, then fetches the latest scores. If the board
  //  can't be reached it's marked offline and keeps showing what it had.
  function refresh(force) {
    if (!board) {
      return Promise.resolve();
    }
    if (refreshing) {
      refreshAgain = refreshAgain || force;
      return refreshing;
    }
    if (!force && Date.now() - lastRefresh < REFRESH_MS) {
      return Promise.resolve();
    }
    refreshing = flush().catch(function() {
      //  Scores that couldn't go up wait for next time.
    }).then(fetchLists).then(function(fetched) {
      lists = fetched;
      status = 'online';
      save(KEYS.cache, { board: board, lists: fetched });
    }, function() {
      status = 'offline';
    }).then(function() {
      refreshing = null;
      lastRefresh = Date.now();
      if (api.onUpdate) {
        api.onUpdate();
      }
      if (refreshAgain) {
        refreshAgain = false;
        refresh(true);
      }
    });
    return refreshing;
  }

  //  A top 10 to show, this week's or (with 'all') the all-time one: the
  //  board as last fetched, plus scores from this device that are still
  //  waiting to go up.
  function top(view) {
    var week = thisWeek();
    var weekly = view !== 'all';
    var fetched = weekly ? (lists.week && lists.week.week === week ? lists.week.entries : []) : lists.all || [];
    var known = {};
    var list = fetched.slice();
    list.forEach(function(entry) { known[entry.id] = true; });
    pending.forEach(function(entry) {
      if (entry.board === board && !known[entry.id] && (!weekly || weekPlayed(entry) === week)) {
        list.push({ id: entry.id, initials: entry.initials, score: entry.score, playedAt: entry.playedAt, pending: true });
      }
    });
    list.sort(function(a, b) {
      return b.score - a.score || (a.playedAt < b.playedAt ? -1 : 1);
    });
    return list.slice(0, SIZE);
  }

  //  Where a score stands on this week's board, for sharing: its place, the
  //  nearest other player above it and by how much, or at the top, the
  //  nearest one below. Null if it isn't in this week's top 10.
  function standing(id) {
    var list = top('week');
    var place = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        place = i;
      }
    }
    if (place < 0) {
      return null;
    }
    var entry = list[place];
    var nearest = function(step) {
      for (var j = place + step; j >= 0 && j < list.length; j += step) {
        if (list[j].initials !== entry.initials) {
          return { initials: list[j].initials, by: Math.abs(list[j].score - entry.score) };
        }
      }
      return null;
    };
    return { rank: place + 1, behind: nearest(-1), ahead: place === 0 ? nearest(1) : null };
  }

  //  Last week's winner, or null if nobody played last week (or the board
  //  hasn't been fetched since).
  function champion() {
    var crowned = lists.champion;
    return crowned && crowned.week === thisWeek() - 1 ? crowned.entry : null;
  }

  //  Whether a score would make this week's top 10. Any score that makes
  //  the all-time top 10 makes this week's too.
  function qualifies(score) {
    if (!board || !(score > 0)) {
      return false;
    }
    var list = top('week');
    return list.length < SIZE || score > list[SIZE - 1].score;
  }

  //  Queues a score for the board and starts uploading it. Returns its id.
  function submit(initials, score) {
    var entry = { id: newId(), board: board, initials: initials, score: score, playedAt: new Date().toISOString() };
    pending.push(entry);
    save(KEYS.pending, pending);
    save(KEYS.initials, initials);
    markOffered();
    refresh(true);
    return entry.id;
  }

  function newId() {
    var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var bytes = new Uint8Array(20);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < bytes.length; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    var id = '';
    for (var j = 0; j < bytes.length; j++) {
      id += letters.charAt(bytes[j] % letters.length);
    }
    return id;
  }

  //  Notes a finished game's score, board or not, so this device knows its
  //  best this week.
  function played(score) {
    var best = load(KEYS.weekBest, null);
    var week = thisWeek();
    if (!best || best.week !== week || score > best.score) {
      save(KEYS.weekBest, { week: week, score: score });
    }
  }

  function weekBest() {
    var best = load(KEYS.weekBest, null);
    return best && best.week === thisWeek() ? best.score : 0;
  }

  //  The first time a device opens a board, its best score this week is
  //  offered to it, once, if the board has loaded and the score would make it.
  function shouldOffer() {
    var offered = load(KEYS.offered, {});
    return status === 'online' && !offered[board] && qualifies(weekBest());
  }

  function markOffered() {
    var offered = load(KEYS.offered, {});
    offered[board] = true;
    save(KEYS.offered, offered);
  }

  var api = {
    board: function() { return board; },
    name: boardName,
    status: function() { return status; },
    size: SIZE,
    top: top,
    standing: standing,
    champion: champion,
    qualifies: qualifies,
    submit: submit,
    refresh: refresh,
    initials: function() { return load(KEYS.initials, ''); },
    played: played,
    weekBest: weekBest,
    shouldOffer: shouldOffer,
    markOffered: markOffered,

    //  The score just added from this device, to pick out on the board.
    highlightId: null,

    //  Called after each attempt to reach the board.
    onUpdate: null
  };
  return api;
})();
