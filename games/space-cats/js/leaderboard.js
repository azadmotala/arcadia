/*
  leaderboard.js

  A shared top 10 for a family or friends, kept in Arcadia's Firebase
  project (Firestore). A board is opened with a private code in the link,
  ?board=..., which this device then remembers. Every Arcadia game uses the
  same board code, and each game keeps its own scores on that board.

  Each board has its own players, by three letters like an arcade game's
  initials, shared by every game and device on it. The top 10s show each
  player once, with their best: this week's, which starts fresh every week
  and crowns last week's winner, the all-time one, and today's, for the
  day's challenge, which gives yesterday's winner a star.

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

  //  This game's name in the database. On each board, under
  //  boards/{board}/games/{GAME}, it keeps:
  //    plays/{id}                  every game that made the board
  //    bests/{player}              each player's best ever
  //    weeks/{week}/bests/{player} each player's best in a week
  //    days/{day}/bests/{player}   each player's best in a day's challenge
  //    scores/{id}                 scores from before players, by initials
  //  The board's players are at boards/{board}/players/{player}.
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
  //  three days, and one from a day's challenge for a day after that day.
  //  After that the rules turn it away.
  var LATE_MS = 3 * DAY_MS;
  var DAILY_LATE_MS = DAY_MS;

  //  Days start at midnight, South African time, like weeks, and are
  //  numbered from 1 January 1970.
  var DAY_ZERO_MS = -2 * 60 * 60 * 1000;

  //  A new player's name: three capital letters, like an arcade game's
  //  initials. Players added before then keep their longer names (a first
  //  name or nickname of up to 10 letters, numbers, spaces, hyphens or
  //  apostrophes), which is what the rules check.
  var NAME_PATTERN = /^[A-Z]{3}$/;
  var NAME_LENGTH = 3;

  //  Don't fetch the board more often than this, unless a score was added.
  var REFRESH_MS = 10000;

  //  What this device remembers. The board, its players and the sign-in are
  //  shared by every Arcadia game; the rest belongs to this game.
  var KEYS = {
    board: 'arcadia.board',
    auth: 'arcadia.auth',
    lastPlayer: 'arcadia.lastPlayer',
    pendingPlayers: 'arcadia.pendingPlayers',
    pending: 'arcadia.' + GAME + '.pendingScores',
    cache: 'arcadia.' + GAME + '.leaderboard',
    offered: 'arcadia.' + GAME + '.offeredHighScore',
    weekBest: 'arcadia.' + GAME + '.weekBest',
    dayBest: 'arcadia.' + GAME + '.dayBest',
    firstWeek: 'arcadia.' + GAME + '.firstWeek'
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

  //  The day a moment falls in, and when a day starts.
  function dayOf(time) {
    return Math.floor((time - DAY_ZERO_MS) / DAY_MS);
  }

  function today() {
    return dayOf(Date.now());
  }

  function dayStart(day) {
    return DAY_ZERO_MS + day * DAY_MS;
  }

  //  Whether a waiting score is from a day's challenge, rather than a game.
  function isDaily(entry) {
    return typeof entry.day === 'number';
  }

  var board = findBoard();

  //  The board as last fetched: this week's top 10, last week's winner, the
  //  all-time top 10, the board's players, today's challenge's top 10 and
  //  yesterday's winner. The weekly and daily ones say which week or day
  //  they're for, so they can be left out once it's over.
  //  A row in a top 10 is one player's best: { key, player, name, score,
  //  playedAt }, where key is 'p:' and the player's id, or for scores from
  //  before players, 'i:' and their initials (and name is the initials).
  var cache = load(KEYS.cache, null);
  var lists = cache && cache.board === board && cache.lists && cache.lists.players ? cache.lists :
    { week: null, champion: null, all: null, players: [] };

  //  Scores and new players from this device waiting to go up. A score is
  //  { id, board, player, name, score, playedAt, done }, where done notes
  //  which of its writes have gone up. Scores saved by earlier versions have
  //  initials instead of a player.
  var pending = load(KEYS.pending, []);
  var pendingPlayers = load(KEYS.pendingPlayers, []);

  var status = board ? 'loading' : 'off';
  var lastRefresh = 0;
  var refreshing = null;
  var refreshAgain = false;
  var lastError = null;
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

  function sendJson(method, url, body, token) {
    var headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers.Authorization = 'Bearer ' + token;
    }
    return request(url, { method: method, headers: headers, body: JSON.stringify(body) });
  }

  function postJson(url, body, token) {
    return sendJson('POST', url, body, token);
  }

  //  Signs in anonymously, which the rules require for adding anything. The
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

  //  Where this game's things are on a board, under the database's documents.
  function gamePath(code) {
    return 'boards/' + code + '/games/' + GAME;
  }

  //  Runs a query on a collection under a path, returning each document's
  //  id and fields.
  function runQuery(path, query) {
    return postJson(DOCUMENTS + '/' + path + ':runQuery?key=' + API_KEY, { structuredQuery: query }).then(function(rows) {
      return rows.filter(function(row) { return row.document; }).map(function(row) {
        return { id: row.document.name.split('/').pop(), fields: row.document.fields };
      });
    });
  }

  //  The top scores in a collection, highest first, optionally just those
  //  from one week.
  function topQuery(collection, size, week) {
    var query = {
      from: [{ collectionId: collection }],
      orderBy: [{ field: { fieldPath: 'score' }, direction: 'DESCENDING' }],
      limit: size
    };
    if (week !== undefined) {
      query.where = { fieldFilter: { field: { fieldPath: 'week' }, op: 'EQUAL', value: { integerValue: String(week) } } };
    }
    return query;
  }

  //  The players' bests, from one week or (with null) all time, or under
  //  another path, as rows.
  function fetchBests(week, size, path) {
    path = path || (week === null ? gamePath(board) : gamePath(board) + '/weeks/' + week);
    return runQuery(path, topQuery('bests', size)).then(function(docs) {
      return docs.map(function(doc) {
        return {
          key: 'p:' + doc.id,
          player: doc.id,
          name: doc.fields.name.stringValue,
          score: Number(doc.fields.score.integerValue),
          playedAt: doc.fields.playedAt.timestampValue
        };
      });
    });
  }

  //  Scores from before players, from one week or (with null) all time, as
  //  rows: one for each set of initials, its best.
  function fetchInitials(week, size) {
    return runQuery(gamePath(board), topQuery('scores', size, week === null ? undefined : week)).then(function(docs) {
      return ranked(docs.map(function(doc) {
        return {
          key: 'i:' + doc.fields.initials.stringValue,
          name: doc.fields.initials.stringValue,
          score: Number(doc.fields.score.integerValue),
          playedAt: doc.fields.playedAt.timestampValue
        };
      }));
    });
  }

  function fetchPlayers() {
    return runQuery('boards/' + board, {
      from: [{ collectionId: 'players' }],
      orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'ASCENDING' }],
      limit: 50
    }).then(function(docs) {
      return docs.map(function(doc) {
        return { id: doc.id, name: doc.fields.name.stringValue };
      });
    });
  }

  //  This week's top 10, last week's winner, the all-time top 10, today's
  //  challenge's top 10, yesterday's winner and the players, with the scores
  //  from before players mixed in.
  function fetchLists() {
    var week = thisWeek();
    var day = today();
    return Promise.all([
      fetchBests(week, SIZE), fetchInitials(week, SIZE),
      fetchBests(week - 1, 1), fetchInitials(week - 1, 1),
      fetchBests(null, SIZE), fetchInitials(null, SIZE),
      fetchPlayers(),
      fetchBests(null, SIZE, gamePath(board) + '/days/' + day),
      fetchBests(null, 1, gamePath(board) + '/days/' + (day - 1))
    ]).then(function(found) {
      return {
        week: { week: week, rows: ranked(found[0].concat(found[1])) },
        champion: { week: week - 1, row: ranked(found[2].concat(found[3]))[0] || null },
        all: ranked(found[4].concat(found[5])),
        players: found[6],
        today: { day: day, rows: found[7] },
        yesterday: { day: day - 1, row: found[8][0] || null }
      };
    });
  }

  //  One row for each player (or set of initials), their best, highest
  //  first, the top 10. On an equal score the earlier one goes first.
  function ranked(rows) {
    var best = {};
    rows.forEach(function(row) {
      var kept = best[row.key];
      if (!kept || row.score > kept.score || (row.score === kept.score && row.playedAt < kept.playedAt)) {
        best[row.key] = row;
      }
    });
    return Object.keys(best).map(function(key) { return best[key]; }).sort(function(a, b) {
      return b.score - a.score || (a.playedAt < b.playedAt ? -1 : 1);
    }).slice(0, SIZE);
  }

  function stringValue(value) {
    return { stringValue: value };
  }

  function integerValue(value) {
    return { integerValue: String(value) };
  }

  //  Adds a document with an id made on this device. If an earlier try got
  //  through but its reply was lost, the server says it already exists, and
  //  that counts as done.
  function create(path, id, fields, token) {
    return postJson(DOCUMENTS + '/' + path + '?documentId=' + id + '&key=' + API_KEY, { fields: fields }, token).catch(function(error) {
      if (error.status === 409) {
        return null;
      }
      throw error;
    });
  }

  //  Sets a player's best, which the rules only allow if it's higher than
  //  the one already there. If it isn't, there's nothing to do. A best from
  //  a day's challenge says which day; any other says which week.
  function setBest(path, entry, token) {
    var fields = {
      name: stringValue(entry.name),
      score: integerValue(entry.score),
      playedAt: { timestampValue: entry.playedAt }
    };
    if (isDaily(entry)) {
      fields.day = integerValue(entry.day);
    } else {
      fields.week = integerValue(weekPlayed(entry));
    }
    return sendJson('PATCH', DOCUMENTS + '/' + path + '?key=' + API_KEY, { fields: fields }, token).catch(function(error) {
      if (error.status === 403) {
        return null;
      }
      throw error;
    });
  }

  //  Whether the board, as last fetched, already has a player's best at
  //  least this high, so there's no need to try to set it.
  function hasBest(rows, entry) {
    return (rows || []).some(function(row) {
      return row.player === entry.player && row.score >= entry.score;
    });
  }

  //  Uploads one waiting score: the play itself, then the player's best this
  //  week and best ever. Each is noted as done as it goes up, so a failure
  //  part way only leaves the rest for next time.
  function upload(entry, token) {
    if (isDaily(entry)) {
      //  From a day's challenge: just the player's best that day.
      var knownToday = entry.board === board && lists.today && lists.today.day === entry.day && hasBest(lists.today.rows, entry);
      return knownToday ? null : setBest(gamePath(entry.board) + '/days/' + entry.day + '/bests/' + entry.player, entry, token);
    }
    if (!entry.player) {
      //  Saved by an earlier version, with initials.
      return create(gamePath(entry.board) + '/scores', entry.id, {
        initials: stringValue(entry.initials),
        score: integerValue(entry.score),
        playedAt: { timestampValue: entry.playedAt },
        week: integerValue(weekPlayed(entry))
      }, token);
    }
    var week = weekPlayed(entry);
    var thisBoard = entry.board === board;
    var steps = [
      ['play', function() {
        return create(gamePath(entry.board) + '/plays', entry.id, {
          player: stringValue(entry.player),
          name: stringValue(entry.name),
          score: integerValue(entry.score),
          playedAt: { timestampValue: entry.playedAt },
          week: integerValue(week)
        }, token);
      }],
      ['week', function() {
        var known = thisBoard && lists.week && lists.week.week === week && hasBest(lists.week.rows, entry);
        return known ? null : setBest(gamePath(entry.board) + '/weeks/' + week + '/bests/' + entry.player, entry, token);
      }],
      ['all', function() {
        var known = thisBoard && hasBest(lists.all, entry);
        return known ? null : setBest(gamePath(entry.board) + '/bests/' + entry.player, entry, token);
      }]
    ];
    entry.done = entry.done || {};
    var next = function(i) {
      if (i === steps.length) {
        return null;
      }
      if (entry.done[steps[i][0]]) {
        return next(i + 1);
      }
      return Promise.resolve(steps[i][1]()).then(function() {
        entry.done[steps[i][0]] = true;
        save(KEYS.pending, pending);
        return next(i + 1);
      });
    };
    return next(0);
  }

  //  A new player added on this device while the board's players hadn't
  //  loaded (offline, say) may already be on the board under the same name.
  //  If so, their waiting scores go to that player instead, and they aren't
  //  added again.
  function joinSameNames(found) {
    lists.players = found;
    var last = load(KEYS.lastPlayer, {});
    pendingPlayers = pendingPlayers.filter(function(player) {
      var same = player.board === board && found.filter(function(other) {
        return other.name.toLowerCase() === player.name.toLowerCase();
      })[0];
      if (!same) {
        return true;
      }
      pending.forEach(function(entry) {
        if (entry.player === player.id) {
          entry.player = same.id;
          entry.name = same.name;
        }
      });
      if (last[board] === player.id) {
        last[board] = same.id;
      }
      return false;
    });
    save(KEYS.pendingPlayers, pendingPlayers);
    save(KEYS.pending, pending);
    save(KEYS.lastPlayer, last);
  }

  //  Uploads new players, then waiting scores, oldest first, stopping at the
  //  first failure so the rest wait for the next try. Scores whose week
  //  ended too long ago to be accepted are dropped.
  function flush() {
    var open = pending.filter(function(entry) {
      return isDaily(entry) ? Date.now() < dayStart(entry.day + 1) + DAILY_LATE_MS :
        Date.now() < weekStart(weekPlayed(entry)) + WEEK_MS + LATE_MS;
    });
    if (open.length < pending.length) {
      pending = open;
      save(KEYS.pending, pending);
    }
    if (!pending.length && !pendingPlayers.length) {
      return Promise.resolve();
    }
    var checking = pendingPlayers.some(function(player) { return player.board === board; }) ?
      fetchPlayers().then(joinSameNames) : Promise.resolve();
    return checking.then(signIn).then(function(token) {
      var nextPlayer = function() {
        if (!pendingPlayers.length) {
          return null;
        }
        var player = pendingPlayers[0];
        return create('boards/' + player.board + '/players', player.id, {
          name: stringValue(player.name),
          createdAt: { timestampValue: player.createdAt }
        }, token).then(function() {
          pendingPlayers.shift();
          save(KEYS.pendingPlayers, pendingPlayers);
          return nextPlayer();
        });
      };
      var nextScore = function() {
        if (!pending.length) {
          return null;
        }
        //  A score with nothing left to send (like a challenge score the
        //  board already has as good as) uploads nothing, but still has to
        //  come off the list so the ones behind it can go.
        return Promise.resolve(upload(pending[0], token)).then(function() {
          pending.shift();
          save(KEYS.pending, pending);
          return nextScore();
        });
      };
      return Promise.resolve(nextPlayer()).then(nextScore);
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
    //  If the board changes part way (see useBoard), what was fetched is for
    //  the old one, so it's left out, and the new one is fetched after.
    var code = board;
    refreshing = flush().then(function() {
      lastError = null;
    }, function(error) {
      //  Anything that couldn't go up waits for next time. Why it stopped
      //  is kept for waiting.html, the help page for scores that stay grey.
      lastError = error;
    }).then(fetchLists).then(function(fetched) {
      if (board === code) {
        lists = fetched;
        status = 'online';
        save(KEYS.cache, { board: board, lists: fetched });
      }
    }, function() {
      if (board === code) {
        status = 'offline';
      }
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

  //  A top 10 to show: 'today' for today's challenge, 'week' for this
  //  week's or 'all' for the all-time one. It's the board as last fetched,
  //  with scores from this device that are still waiting to go up counted
  //  in, and marked as waiting where they're a player's best. Today's
  //  challenge has its own top 10, apart from the others.
  function top(view) {
    var week = thisWeek();
    var day = today();
    var rows;
    if (view === 'today') {
      rows = lists.today && lists.today.day === day ? lists.today.rows : [];
    } else if (view === 'all') {
      rows = lists.all || [];
    } else {
      rows = lists.week && lists.week.week === week ? lists.week.rows : [];
    }
    var waiting = pending.filter(function(entry) {
      if (entry.board !== board) {
        return false;
      }
      if (view === 'today') {
        return entry.day === day;
      }
      return !isDaily(entry) && (view === 'all' || weekPlayed(entry) === week);
    }).map(function(entry) {
      return {
        key: entry.player ? 'p:' + entry.player : 'i:' + entry.initials,
        player: entry.player,
        name: entry.name || entry.initials,
        score: entry.score,
        playedAt: entry.playedAt,
        pending: true
      };
    });
    return ranked(rows.concat(waiting));
  }

  //  Where a player stands on this week's board (or today's), for sharing:
  //  their place and best score, the next player up and by how much, or at
  //  the top, the next one down. Null if they aren't in that top 10.
  function standing(key, view) {
    var list = top(view || 'week');
    for (var i = 0; i < list.length; i++) {
      if (list[i].key === key) {
        var gap = function(row) {
          return row ? { name: row.name, by: Math.abs(row.score - list[i].score) } : null;
        };
        return { rank: i + 1, score: list[i].score, behind: gap(list[i - 1]), ahead: i === 0 ? gap(list[1]) : null };
      }
    }
    return null;
  }

  //  Last week's winner, or with 'today', the winner of yesterday's
  //  challenge. Null if nobody played then (or the board hasn't been
  //  fetched since).
  function champion(view) {
    if (view === 'today') {
      var starred = lists.yesterday;
      return starred && starred.day === today() - 1 ? starred.row : null;
    }
    var crowned = lists.champion;
    return crowned && crowned.week === thisWeek() - 1 ? crowned.row : null;
  }

  //  Whether a score is good enough for this week's top 10 (or with
  //  'today', today's challenge's). Any score good enough for the all-time
  //  top 10 is good enough for this week's too.
  function qualifies(score, view) {
    if (!board || !(score > 0)) {
      return false;
    }
    var list = top(view || 'week');
    return list.length < SIZE || score > list[SIZE - 1].score;
  }

  //  The board's players, this device's last player first, then the rest
  //  in alphabetical order.
  function players() {
    var seen = {};
    var list = [];
    lists.players.concat(pendingPlayers.filter(function(player) { return player.board === board; })).forEach(function(player) {
      if (!seen[player.id]) {
        seen[player.id] = true;
        list.push({ id: player.id, name: player.name });
      }
    });
    var last = lastPlayer();
    return list.sort(function(a, b) {
      return (b.id === last) - (a.id === last) || a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
  }

  //  The id of the player who last saved a score on this board from this
  //  device, or null.
  function lastPlayer() {
    return load(KEYS.lastPlayer, {})[board] || null;
  }

  //  Tidies a name as it's typed: capital letters without their accents
  //  (zoë is ZOE), no more than three.
  function cleanTyping(text) {
    var plain = text.normalize ? text.normalize('NFD').replace(/[̀-ͯ]/g, '') : text;
    return plain.toUpperCase().replace(/[^A-Z]/g, '').slice(0, NAME_LENGTH);
  }

  //  A typed name, ready to save, or null if it isn't three letters.
  function cleanName(text) {
    var name = cleanTyping(text);
    return NAME_PATTERN.test(name) ? name : null;
  }

  //  Adds a player to the board, or if one has that name already (in any
  //  mix of capitals), returns them.
  function addPlayer(name) {
    var same = players().filter(function(player) { return player.name.toLowerCase() === name.toLowerCase(); })[0];
    if (same) {
      return same;
    }
    var player = { id: newId(), board: board, name: name, createdAt: new Date().toISOString() };
    pendingPlayers.push(player);
    save(KEYS.pendingPlayers, pendingPlayers);
    return { id: player.id, name: player.name };
  }

  //  Queues a player's score for the board and starts uploading it. A score
  //  from a day's challenge comes with { day, startedAt }, and counts as
  //  played when the run began, so it stays in its day. Returns the
  //  player's key, to pick out their row.
  function submit(player, score, daily) {
    var entry = { id: newId(), board: board, player: player.id, name: player.name, score: score, playedAt: new Date().toISOString(), done: {} };
    if (daily) {
      entry.day = daily.day;
      entry.playedAt = daily.startedAt;
    }
    pending.push(entry);
    save(KEYS.pending, pending);
    var last = load(KEYS.lastPlayer, {});
    last[board] = player.id;
    save(KEYS.lastPlayer, last);
    markOffered();
    refresh(true);
    return 'p:' + player.id;
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

  //  The same for today's challenge: this device's best in it today.
  function playedDaily(score) {
    var best = load(KEYS.dayBest, null);
    var day = today();
    if (!best || best.day !== day || score > best.score) {
      save(KEYS.dayBest, { day: day, score: score });
    }
  }

  function dayBest() {
    var best = load(KEYS.dayBest, null);
    return best && best.day === today() ? best.score : 0;
  }

  //  Which week of the board's championship this is: week 1 is the week of
  //  its first score. Found once and remembered, since it never changes.
  //  Resolves to 1 if the board has no scores yet.
  function fetchWeekNumber() {
    if (!board) {
      return Promise.resolve(null);
    }
    var code = board;
    var known = load(KEYS.firstWeek, {});
    if (typeof known[code] === 'number') {
      return Promise.resolve(thisWeek() - known[code] + 1);
    }
    var earliest = function(path, collection) {
      return runQuery(path, {
        from: [{ collectionId: collection }],
        orderBy: [{ field: { fieldPath: 'playedAt' }, direction: 'ASCENDING' }],
        limit: 1
      }).then(function(docs) {
        return docs.length ? weekOf(Date.parse(docs[0].fields.playedAt.timestampValue)) : null;
      });
    };
    return Promise.all([earliest(gamePath(code), 'plays'), earliest(gamePath(code), 'scores')]).then(function(weeks) {
      var first = weeks.filter(function(week) { return week !== null; }).sort(function(a, b) { return a - b; })[0];
      if (first === undefined) {
        return 1;
      }
      known = load(KEYS.firstWeek, {});
      known[code] = first;
      save(KEYS.firstWeek, known);
      return thisWeek() - first + 1;
    });
  }

  //  Switches to another board, as when the home page makes a new one, and
  //  fetches it.
  function useBoard(code) {
    board = code;
    cache = load(KEYS.cache, null);
    lists = cache && cache.board === board && cache.lists && cache.lists.players ? cache.lists :
      { week: null, champion: null, all: null, players: [] };
    status = board ? 'loading' : 'off';
    lastRefresh = 0;
    return refresh(true);
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
    nameLength: NAME_LENGTH,
    top: top,
    standing: standing,
    champion: champion,
    qualifies: qualifies,
    players: players,
    lastPlayer: lastPlayer,
    cleanTyping: cleanTyping,
    cleanName: cleanName,
    addPlayer: addPlayer,
    submit: submit,
    refresh: refresh,
    useBoard: useBoard,
    fetchWeekNumber: fetchWeekNumber,
    played: played,
    weekBest: weekBest,
    playedDaily: playedDaily,
    dayBest: dayBest,
    shouldOffer: shouldOffer,
    markOffered: markOffered,

    //  The key of the player whose score was just added from this device,
    //  to pick out their row on the board.
    highlightKey: null,

    //  Called after each attempt to reach the board.
    onUpdate: null,

    //  Why the last try to send waiting scores stopped, or null if it
    //  didn't.
    lastError: function() { return lastError; }
  };
  return api;
})();
