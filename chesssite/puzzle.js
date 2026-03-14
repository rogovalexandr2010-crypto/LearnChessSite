/**
 * puzzle.js — Chess Puzzle Module
 * Requires: chess.js, chessboard.js, jQuery
 * Expects a global `PuzzleApp` namespace to be initialized by puzzles.html
 */

var PuzzleModule = (function () {

  // ── State ──────────────────────────────────────────────────────────────
  var allPuzzles   = [];
  var filteredList = [];
  var currentPuzzle = null;
  var chess        = null;   // chess.js instance
  var cboard       = null;   // chessboard.js instance
  var moves        = [];     // full move list from puzzle
  var moveIdx      = 0;      // which move we're waiting for
  var playerColor  = 'w';
  var selectedSq   = null;
  var solved       = false;
  var failed       = false;
  var autoTimer    = null;

  // ── Helpers ─────────────────────────────────────────────────────────────
  function colorFromFen(fen) {
    return fen.split(' ')[1] === 'w' ? 'w' : 'b';
  }

  function sqColor(sq) {
    var file = sq.charCodeAt(0) - 97;
    var rank = parseInt(sq[1]) - 1;
    return (file + rank) % 2 === 0 ? 'dark' : 'light';
  }

  function isPlayerTurn() {
    return moveIdx % 2 === 1; // after opponent's first move, odd indices = player
  }

  // ── Board helpers ────────────────────────────────────────────────────────
  function hlSq(sq, type) {
    var el = document.querySelector('[data-square="' + sq + '"]');
    if (!el) return;
    clearSqEl(el);
    el.classList.add('hl-' + type);
  }
  function clearSqEl(el) {
    el.classList.remove('hl-from','hl-to','hl-wrong','hl-sel','hl-hint');
  }
  function clearHL() {
    document.querySelectorAll('.hl-from,.hl-to,.hl-wrong,.hl-sel,.hl-hint').forEach(clearSqEl);
  }

  function drawArrow(fromSq, toSq) {
    var wrap = document.getElementById('pz-board-wrap');
    if (!wrap) return;
    var sz = wrap.offsetWidth, sq = sz / 8;
    var flip = playerColor === 'b';
    var fc = fromSq.charCodeAt(0)-97, fr = 8-parseInt(fromSq[1]);
    var tc = toSq.charCodeAt(0)-97,   tr = 8-parseInt(toSq[1]);
    var x1 = (flip?7-fc:fc)*sq+sq/2, y1 = (flip?7-fr:fr)*sq+sq/2;
    var x2 = (flip?7-tc:tc)*sq+sq/2, y2 = (flip?7-tr:tr)*sq+sq/2;
    var dx=x2-x1,dy=y2-y1,len=Math.sqrt(dx*dx+dy*dy),sh=sq*0.3;
    var ex=x2-(dx/len)*sh, ey=y2-(dy/len)*sh;
    var L = document.getElementById('pz-arrow');
    if (!L) return;
    L.setAttribute('x1',x1); L.setAttribute('y1',y1);
    L.setAttribute('x2',ex); L.setAttribute('y2',ey);
    L.setAttribute('opacity','1');
  }
  function clearArrow() {
    var L = document.getElementById('pz-arrow');
    if (L) L.setAttribute('opacity','0');
  }

  function setStatus(msg, type) {
    var el = document.getElementById('pz-status');
    if (!el) return;
    el.textContent = msg;
    el.className = 'pz-status-text' + (type ? ' ' + type : '');
  }

  function updateBoardColors() {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var light = isDark ? '#c8c0b0' : '#f0d9b5';
    var dark  = isDark ? '#6b5e4e' : '#b58863';
    var st = document.getElementById('_pz_cbcss');
    if (!st) { st = document.createElement('style'); st.id = '_pz_cbcss'; document.head.appendChild(st); }
    st.textContent =
      '.board-b72b1 .white-1e1d7{background-color:'+light+'!important}' +
      '.board-b72b1 .black-3c85d{background-color:'+dark+'!important}';
  }

  function boardSize() {
    var wrap = document.getElementById('pz-board-wrap');
    if (!wrap) return 400;
    return wrap.offsetWidth;
  }

  // ── Ratings display ──────────────────────────────────────────────────────
  function getRatingLabel(r) {
    if (r < 1000) return '🟢 Beginner';
    if (r < 1400) return '🟡 Intermediate';
    if (r < 1800) return '🟠 Advanced';
    return '🔴 Expert';
  }

  // ── Load puzzles ─────────────────────────────────────────────────────────
  function loadFromJSON(data) {
    allPuzzles = Array.isArray(data) ? data : [];
    filteredList = allPuzzles.slice();
    renderThemeOptions();
    updateCounter();
  }

  function loadFromCSV(text) {
    var lines = text.trim().split('\n');
    var headers = lines[0].split(',');
    allPuzzles = [];
    for (var i = 1; i < lines.length; i++) {
      var parts = lines[i].split(',');
      if (parts.length < 9) continue;
      var obj = {};
      headers.forEach(function(h, idx) { obj[h.trim()] = (parts[idx]||'').trim(); });
      obj.Rating = parseInt(obj.Rating) || 1200;
      allPuzzles.push(obj);
    }
    filteredList = allPuzzles.slice();
    renderThemeOptions();
    updateCounter();
  }

  // ── Filters ──────────────────────────────────────────────────────────────
  function getAllThemes() {
    var set = {};
    allPuzzles.forEach(function(p) {
      (p.Themes||'').split(' ').forEach(function(t) { if(t) set[t]=true; });
    });
    return Object.keys(set).sort();
  }

  function renderThemeOptions() {
    var sel = document.getElementById('pz-theme-filter');
    if (!sel) return;
    var themes = getAllThemes();
    sel.innerHTML = '<option value="">All themes</option>';
    themes.forEach(function(t) {
      var opt = document.createElement('option');
      opt.value = t; opt.textContent = t;
      sel.appendChild(opt);
    });
  }

  function applyFilters() {
    var minR = parseInt(document.getElementById('pz-min-rating').value) || 0;
    var maxR = parseInt(document.getElementById('pz-max-rating').value) || 9999;
    var theme = (document.getElementById('pz-theme-filter').value || '').trim();
    filteredList = allPuzzles.filter(function(p) {
      var r = parseInt(p.Rating) || 1200;
      if (r < minR || r > maxR) return false;
      if (theme && !(p.Themes||'').split(' ').includes(theme)) return false;
      return true;
    });
    updateCounter();
  }

  function updateCounter() {
    var el = document.getElementById('pz-counter');
    if (el) el.textContent = filteredList.length + ' puzzles';
  }

  // ── Start puzzle ─────────────────────────────────────────────────────────
  function startPuzzle(puzzle) {
    if (!puzzle) { setStatus('No puzzles match your filters', 'err'); return; }
    currentPuzzle = puzzle;
    solved = false; failed = false; selectedSq = null;
    clearTimeout(autoTimer);

    moves = (puzzle.Moves || '').trim().split(' ').filter(Boolean);
    if (moves.length < 2) { nextPuzzle(); return; }

    // Setup chess.js with the given FEN
    chess = new Chess();
    chess.load(puzzle.FEN);

    // The FEN side to move is the opponent — apply their first move
    var opponentMove = moves[0];
    var from = opponentMove.slice(0, 2);
    var to   = opponentMove.slice(2, 4);
    var promo = opponentMove[4] || undefined;
    chess.move({ from: from, to: to, promotion: promo || 'q' });

    // Now it's the player's turn
    playerColor = chess.turn(); // 'w' or 'b'
    moveIdx = 1; // next move the player should make is moves[1]

    // Init board
    if (cboard) { cboard.destroy(); cboard = null; }
    clearArrow();

    var sz = boardSize();
    cboard = Chessboard('pz-board', {
      position:    chess.fen(),
      orientation: playerColor === 'w' ? 'white' : 'black',
      pieceTheme:  'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
      showNotation: true,
      draggable:   false
    });
    updateBoardColors();

    // Update meta
    var r = parseInt(puzzle.Rating) || 1200;
    var themes = (puzzle.Themes || '').split(' ').filter(Boolean);
    document.getElementById('pz-rating-val').textContent = r;
    document.getElementById('pz-rating-lbl').textContent = getRatingLabel(r);
    document.getElementById('pz-themes').innerHTML = themes.map(function(t) {
      return '<span class="pz-tag">' + t + '</span>';
    }).join('');
    document.getElementById('pz-id').textContent = '#' + puzzle.PuzzleId;

    var gameUrl = puzzle.GameUrl || '';
    var gameLink = document.getElementById('pz-game-link');
    if (gameLink) { gameLink.href = gameUrl; gameLink.style.display = gameUrl ? '' : 'none'; }

    setStatus('Find the best move!', 'inf');
    enableClick();
    updateProgress();
    clearHL();
  }

  function randomPuzzle() {
    if (!filteredList.length) { setStatus('No puzzles match your filters', 'err'); return; }
    var idx = Math.floor(Math.random() * filteredList.length);
    startPuzzle(filteredList[idx]);
  }

  function nextPuzzle() { randomPuzzle(); }

  // ── Click handling ────────────────────────────────────────────────────────
  function enableClick() {
    var el = document.getElementById('pz-board');
    if (!el) return;
    el.style.pointerEvents = '';
    el.onclick = handleClick;
  }
  function disableClick() {
    var el = document.getElementById('pz-board');
    if (!el) return;
    el.style.pointerEvents = 'none';
    el.onclick = null;
  }

  function handleClick(e) {
    if (solved || failed) return;
    var sqEl = $(e.target).closest('[data-square]');
    if (!sqEl.length) return;
    var sq = sqEl.data('square');

    if (!selectedSq) {
      var piece = chess.get(sq);
      if (!piece || piece.color !== playerColor) return;
      selectedSq = sq;
      clearHL(); hlSq(sq, 'sel');
    } else {
      if (sq === selectedSq) { selectedSq = null; clearHL(); return; }
      tryMove(selectedSq, sq);
    }
  }

  function tryMove(from, to) {
    var expectedMove = moves[moveIdx];
    var expFrom = expectedMove.slice(0, 2);
    var expTo   = expectedMove.slice(2, 4);

    if (from === expFrom && to === expTo) {
      // ✓ Correct
      var promo = expectedMove[4] || 'q';
      chess.move({ from: from, to: to, promotion: promo });
      clearHL(); hlSq(from, 'from'); hlSq(to, 'to');
      cboard.position(chess.fen(), false);
      moveIdx++;
      updateProgress();

      if (moveIdx >= moves.length) {
        // Puzzle solved!
        solved = true;
        disableClick();
        setStatus('✓ Puzzle solved!', 'ok');
        showConfetti();
      } else {
        // Play opponent's response
        setStatus('Good move! Keep going…', 'ok');
        selectedSq = null;
        autoTimer = setTimeout(playOpponent, 700);
      }
    } else {
      // ✗ Wrong
      failed = false; // allow retry
      clearHL(); hlSq(from, 'sel'); hlSq(to, 'wrong');
      setStatus('✗ Wrong move — try again', 'err');
      selectedSq = null;
      setTimeout(function() { clearHL(); setStatus('Find the best move!', 'inf'); }, 1000);
    }
  }

  function playOpponent() {
    if (moveIdx >= moves.length) return;
    var mv = moves[moveIdx];
    var from = mv.slice(0, 2), to = mv.slice(2, 4), promo = mv[4] || 'q';
    chess.move({ from: from, to: to, promotion: promo });
    clearHL(); hlSq(from, 'from'); hlSq(to, 'to');
    cboard.position(chess.fen(), false);
    moveIdx++;
    updateProgress();

    if (moveIdx >= moves.length) {
      solved = true;
      disableClick();
      setStatus('✓ Puzzle solved!', 'ok');
      showConfetti();
    } else {
      setStatus('Your turn…', 'inf');
      enableClick();
    }
  }

  // ── Hint ─────────────────────────────────────────────────────────────────
  function showHint() {
    if (solved || moveIdx >= moves.length) return;
    var mv = moves[moveIdx];
    var from = mv.slice(0, 2), to = mv.slice(2, 4);
    clearHL();
    drawArrow(from, to);
    setStatus('Hint: ' + from + ' → ' + to, 'inf');
    setTimeout(clearArrow, 2000);
  }

  // ── Progress bar ──────────────────────────────────────────────────────────
  function updateProgress() {
    var total = moves.length;
    // Player moves are odd indices (1, 3, 5…)
    var playerMoves = Math.ceil(total / 2);
    var doneIdx = Math.floor(moveIdx / 2);
    var pct = playerMoves > 0 ? Math.round((doneIdx / playerMoves) * 100) : 0;
    var bar = document.getElementById('pz-progress-bar');
    if (bar) bar.style.width = Math.min(pct, 100) + '%';
    var lbl = document.getElementById('pz-progress-lbl');
    if (lbl) lbl.textContent = 'Move ' + doneIdx + ' of ' + playerMoves;
  }

  // ── Confetti ──────────────────────────────────────────────────────────────
  function showConfetti() {
    var container = document.getElementById('pz-confetti');
    if (!container) return;
    container.innerHTML = '';
    var colors = ['#f0d9b5','#b58863','#3dd68c','#f5c842','#6c8ef7'];
    for (var i = 0; i < 40; i++) {
      var d = document.createElement('div');
      d.className = 'confetti-piece';
      d.style.cssText =
        'left:' + Math.random()*100 + '%;' +
        'background:' + colors[Math.floor(Math.random()*colors.length)] + ';' +
        'animation-delay:' + (Math.random()*0.5) + 's;' +
        'animation-duration:' + (0.8+Math.random()*0.8) + 's;' +
        'width:' + (6+Math.random()*6) + 'px;height:' + (6+Math.random()*6) + 'px;' +
        'transform:rotate(' + Math.random()*360 + 'deg)';
      container.appendChild(d);
    }
    setTimeout(function() { container.innerHTML = ''; }, 2000);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  return {
    loadFromJSON:  loadFromJSON,
    loadFromCSV:   loadFromCSV,
    applyFilters:  applyFilters,
    randomPuzzle:  randomPuzzle,
    nextPuzzle:    nextPuzzle,
    showHint:      showHint,
    updateBoardColors: updateBoardColors,
    boardSize: function() {
      if (cboard) {
        var sz = boardSize();
        document.getElementById('pz-board-wrap').style.width = sz + 'px';
        document.getElementById('pz-board-wrap').style.height = sz + 'px';
        cboard.resize();
        updateBoardColors();
      }
    }
  };

})();
