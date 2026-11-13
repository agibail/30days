/* Crossword Together — Day 10
   Puzzles: github.com/doshea/nyt_crosswords (NYT, 1976–2018), fetched live.
   Partners: PeerJS (WebRTC). The first person in a room hosts and relays. */
(() => {
  'use strict';

  const ARCHIVE = 'https://raw.githubusercontent.com/doshea/nyt_crosswords/master/';
  const MIN_DATE = '1976-01-01', MAX_DATE = '2018-12-31';
  const PEER_PREFIX = 'thirtydays-xword-';
  const INKS = ['a', 'b', 'c', 'd'];
  // pen colours anyone can pick; slots (a–d) are players and decide the handwriting
  const PENS = { black: '#1d1b19', red: '#c0281f', pink: '#e0418a', orange: '#e2700a', green: '#1f7a3c', blue: '#1f3a9e', purple: '#6e2a86' };
  const PEN_ORDER = ['black', 'red', 'pink', 'orange', 'green', 'blue', 'purple'];
  const DEFAULT_PEN = { a: 'black', b: 'blue', c: 'green', d: 'purple' };
  const LEGACY = { a: '#3d3d3d', b: '#1f3a9e', c: '#1b6e3a', d: '#6e2a86' }; // fills saved before pens existed
  const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const $ = (s) => document.querySelector(s);
  const el = {
    grid: $('#grid'), kb: $('#kb'), across: $('#across'), down: $('#down'),
    cbNum: $('#cbNum'), cbText: $('#cbText'), title: $('#title'), byline: $('#byline'),
    puzNo: $('#puzNo'), runDate: $('#runDate'), runDow: $('#runDow'),
    folioL: $('#folioL'), folioR: $('#folioR'), timer: $('#timer'), stamp: $('#stamp'),
    stampTime: $('#stampTime'), loading: $('#loading'), dateIn: $('#dateIn'),
    pencilBtn: $('#pencilBtn'), toast: $('#toast'), dot: $('#dot'), statusText: $('#statusText'),
    soloBox: $('#soloBox'), roomBox: $('#roomBox'), roomCode: $('#roomCode'), roomLink: $('#roomLink'),
    who: $('#who'), pens: $('#pens'),
  };

  // ---------- state ----------
  let puz = null;         // parsed puzzle
  let fills = [];         // per cell: null | {v, by, p (pencil), m ('wrong'|'revealed')}
  let sel = { i: 0, dir: 'across' };
  let pencil = false;
  let myInk = 'a';
  let elapsed = 0, tickFrom = null, solved = false;
  const partners = {};    // ink -> {i, dir}
  const pens = {};        // ink -> pen name
  let myPen = null;       // chosen pen (also remembered in localStorage)
  const penOf = (ink) => pens[ink] || DEFAULT_PEN[ink] || 'black';
  const colorOf = (ink) => PENS[penOf(ink)];
  const fillColor = (f) => PENS[f.by] || LEGACY[f.by] || '';
  const allPens = () => Object.assign({}, pens, { [myInk]: penOf(myInk) });

  // ---------- small utils ----------
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem('xw30:' + k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('xw30:' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  const ta = document.createElement('textarea');
  const clean = (s) => { ta.innerHTML = String(s).replace(/<[^>]*>/g, ''); return ta.value; };
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const parseIso = (s) => new Date(s + 'T00:00:00Z');
  const fmtTime = (ms) => {
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
    return (h ? h + ':' + pad(m) : m) + ':' + pad(s % 60);
  };
  let toastT;
  function toast(msg, ms = 2600) {
    el.toast.textContent = msg; el.toast.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => (el.toast.hidden = true), ms);
  }

  // ---------- loading puzzles ----------
  async function fetchPuzzle(date) {
    const [y, m, d] = date.split('-');
    const res = await fetch(`${ARCHIVE}${y}/${m}/${d}.json`);
    if (!res.ok) throw new Error(res.status === 404 ? 'missing' : 'http ' + res.status);
    return res.json();
  }

  function parse(j, date) {
    const rows = j.size.rows, cols = j.size.cols;
    const circles = j.circles || [];
    const cells = j.grid.map((a, i) => ({
      i, r: Math.floor(i / cols), c: i % cols,
      ans: a === '.' ? null : String(a).toUpperCase(),
      num: (j.gridnums && j.gridnums[i]) || 0,
      circle: !!circles[i], across: null, down: null,
    }));
    const open = (r, c) => r >= 0 && c >= 0 && r < rows && c < cols && cells[r * cols + c].ans;
    const clueMap = { across: {}, down: {} };
    for (const dir of ['across', 'down']) {
      (j.clues[dir] || []).forEach((s) => {
        const m = /^\s*(\d+)\.\s*([\s\S]*)$/.exec(s);
        if (m) clueMap[dir][m[1]] = clean(m[2]);
      });
    }
    const words = [];
    for (const dir of ['across', 'down']) {
      const [dr, dc] = dir === 'across' ? [0, 1] : [1, 0];
      for (const cell of cells) {
        if (!cell.ans || open(cell.r - dr, cell.c - dc) || !open(cell.r + dr, cell.c + dc)) continue;
        const w = { id: words.length, dir, num: cell.num, cells: [], clue: '' };
        let r = cell.r, c = cell.c;
        while (open(r, c)) { const ci = r * cols + c; w.cells.push(ci); cells[ci][dir] = w.id; r += dr; c += dc; }
        w.clue = clueMap[dir][w.num] || '—';
        words.push(w);
      }
    }
    words.sort((a, b) => (a.dir === b.dir ? a.num - b.num : a.dir === 'across' ? -1 : 1));
    words.forEach((w, k) => { w.order = k; });
    const byId = {}; words.forEach((w) => (byId[w.id] = w));
    const d = parseIso(date);
    return {
      date, rows, cols, cells, words, byId,
      shade: !!j.shadecircles,
      title: j.title ? clean(j.title) : '',
      author: clean(j.author || ''), editor: clean(j.editor || ''),
      dow: DOW[d.getUTCDay()],
      long: `${DOW[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`,
      no: Math.round((d - parseIso(MIN_DATE)) / 864e5) + 1,
    };
  }

  let loadSeq = 0;
  async function loadPuzzle(date, opts = {}) {
    const seq = ++loadSeq;
    el.loading.hidden = false; el.loading.textContent = 'Turning pages…';
    let j;
    try { j = await fetchPuzzle(date); }
    catch (e) {
      if (seq !== loadSeq) return false;
      el.loading.hidden = !!puz;
      if (!opts.quiet) toast(e.message === 'missing' ? `That page is torn out — no puzzle for ${date}.` : 'Could not reach the archive. Check your connection.');
      return false;
    }
    if (seq !== loadSeq) return false;
    puz = parse(j, date);
    const saved = opts.fills ? null : store.get(date);
    fills = opts.fills ? opts.fills.slice() : (saved && saved.fills) || puz.cells.map(() => null);
    elapsed = opts.elapsed != null ? opts.elapsed : (saved && saved.elapsed) || 0;
    solved = false;
    for (const k in partners) partners[k] = null;
    tickFrom = Date.now();
    store.set('last', date);
    el.dateIn.value = date;
    setUrl();
    buildGrid(); buildClues(); renderHeader();
    const first = puz.words[0];
    sel = { i: first ? first.cells[0] : 0, dir: first ? first.dir : 'across' };
    el.loading.hidden = true;
    el.stamp.hidden = true;
    checkSolved(true);
    paint();
    if (!opts.remote) sendSync();
    return true;
  }

  function randomDate(dow) {
    const a = parseIso(MIN_DATE).getTime(), b = parseIso(MAX_DATE).getTime();
    const d = new Date(a + Math.random() * (b - a));
    d.setUTCHours(0, 0, 0, 0);
    if (dow !== 'any' && dow != null) {
      const shift = (Number(dow) - d.getUTCDay() + 7) % 7;
      d.setUTCDate(d.getUTCDate() + shift);
      if (iso(d) > MAX_DATE) d.setUTCDate(d.getUTCDate() - 7);
    }
    return iso(d);
  }
  async function loadRandom(dow) {
    for (let k = 0; k < 8; k++) if (await loadPuzzle(randomDate(dow), { quiet: k < 7 })) return true;
    return false;
  }
  // default: today's month & day, in a random archive year
  async function loadDefault() {
    const now = new Date();
    for (let k = 0; k < 6; k++) {
      const y = 1977 + Math.floor(Math.random() * 42);
      if (await loadPuzzle(`${y}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, { quiet: true })) return;
    }
    await loadRandom('any');
  }

  // ---------- rendering ----------
  let cellEls = [];
  function buildGrid() {
    el.grid.style.setProperty('--cols', puz.cols);
    el.grid.closest('.gridwrap').style.setProperty('--cols', puz.cols);
    el.grid.innerHTML = '';
    cellEls = puz.cells.map((cell) => {
      const d = document.createElement('div');
      d.className = 'cell' + (cell.ans ? '' : ' block') + (puz.shade ? ' shade' : '');
      d.dataset.i = cell.i;
      if (cell.ans) {
        if (cell.circle) d.appendChild(Object.assign(document.createElement('span'), { className: 'circ' }));
        if (cell.num) d.appendChild(Object.assign(document.createElement('span'), { className: 'num', textContent: cell.num }));
        d.appendChild(Object.assign(document.createElement('span'), { className: 'fill' }));
      }
      el.grid.appendChild(d);
      return d;
    });
  }

  let clueEls = {};
  function buildClues() {
    el.across.innerHTML = ''; el.down.innerHTML = ''; clueEls = {};
    for (const w of puz.words) {
      const li = document.createElement('li');
      const b = document.createElement('b'); b.textContent = w.num;
      const s = document.createElement('span'); s.textContent = w.clue;
      li.append(b, s);
      li.addEventListener('click', () => { selectWord(w); focusKb(); });
      (w.dir === 'across' ? el.across : el.down).appendChild(li);
      clueEls[w.id] = li;
    }
  }

  function renderHeader() {
    el.title.textContent = puz.title && !/^NY Times/i.test(puz.title) ? puz.title : `${puz.dow}'s Puzzle`;
    const by = [puz.author && `by ${puz.author}`, puz.editor && `edited by ${puz.editor}`].filter(Boolean).join(' · ');
    el.byline.textContent = `${puz.long}${by ? ' — ' + by : ''}`;
    el.puzNo.textContent = puz.no.toLocaleString('en-US');
    el.runDate.textContent = puz.long.toUpperCase();
    el.runDow.textContent = `${puz.dow.toUpperCase()} · ${puz.rows}×${puz.cols}`;
    const p = 2 * (puz.no % 400) + 12;
    el.folioL.textContent = `— ${p} —`; el.folioR.textContent = `— ${p + 1} —`;
    document.title = `Crossword Together · ${puz.long}`;
  }

  const wordAt = (i, dir) => { const id = puz.cells[i][dir]; return id == null ? null : puz.byId[id]; };

  function paint() {
    if (!puz) return;
    const w = wordAt(sel.i, sel.dir);
    const wset = new Set(w ? w.cells : []);
    const pw = new Map(), pc = new Map();
    for (const ink in partners) {
      const p = partners[ink]; if (!p || !puz.cells[p.i]) continue;
      const pword = wordAt(p.i, p.dir);
      if (pword) pword.cells.forEach((ci) => pw.set(ci, ink));
      pc.set(p.i, ink);
    }
    puz.cells.forEach((cell, i) => {
      if (!cell.ans) return;
      const d = cellEls[i], f = fills[i];
      d.classList.toggle('sel', i === sel.i);
      d.classList.toggle('word', wset.has(i));
      d.classList.toggle('pword', pw.has(i));
      d.classList.toggle('pcell', pc.has(i));
      if (pc.has(i) || pw.has(i)) d.style.setProperty('--pcol', colorOf(pc.get(i) || pw.get(i)));
      d.classList.toggle('wrong', !!f && f.m === 'wrong');
      d.classList.toggle('revealed', !!f && f.m === 'revealed');
      const span = d.lastChild;
      const v = f ? f.v : '';
      if (span.textContent !== v) span.textContent = v;
      span.className = 'fill' + (f ? ` ${f.by === 'r' ? 'ink-r' : 'hand-' + (f.s || f.by)}${f.p ? ' pencil' : ''}${v.length > 1 ? ' rebus' : ''}` : '');
      span.style.color = f && f.by !== 'r' ? fillColor(f) : '';
    });
    // clues
    const cross = wordAt(sel.i, sel.dir === 'across' ? 'down' : 'across');
    const pWords = new Map();
    for (const ink in partners) { const p = partners[ink]; if (p && puz.cells[p.i]) { const x = wordAt(p.i, p.dir); if (x) pWords.set(x.id, ink); } }
    for (const word of puz.words) {
      const li = clueEls[word.id];
      li.classList.toggle('cur', !!w && word.id === w.id);
      li.classList.toggle('cross', !!cross && word.id === cross.id);
      li.classList.toggle('partner', pWords.has(word.id));
      if (pWords.has(word.id)) li.style.setProperty('--pcol', colorOf(pWords.get(word.id)));
      li.classList.toggle('done', word.cells.every((ci) => fills[ci] && fills[ci].v));
    }
    if (w) {
      el.cbNum.textContent = `${w.num}${w.dir === 'across' ? 'A' : 'D'}`;
      el.cbText.textContent = w.clue;
      scrollClue(clueEls[w.id]);
      if (cross) scrollClue(clueEls[cross.id]);
    }
  }
  function scrollClue(li) {
    const ol = li.parentElement;
    const top = li.offsetTop - ol.offsetTop, bottom = top + li.offsetHeight;
    if (top < ol.scrollTop || bottom > ol.scrollTop + ol.clientHeight) ol.scrollTop = top - ol.clientHeight / 3;
  }

  // ---------- selection & movement ----------
  function select(i, dir) {
    if (!puz.cells[i] || !puz.cells[i].ans) return;
    if (dir && puz.cells[i][dir] != null) sel.dir = dir;
    else if (puz.cells[i][sel.dir] == null) sel.dir = sel.dir === 'across' ? 'down' : 'across';
    sel.i = i;
    paint(); sendCursor();
  }
  function selectWord(w, preferEmpty = true) {
    const empty = preferEmpty && w.cells.find((ci) => !fills[ci] || !fills[ci].v);
    select(empty != null ? empty : w.cells[0], w.dir);
  }
  function toggleDir() {
    const other = sel.dir === 'across' ? 'down' : 'across';
    if (puz.cells[sel.i][other] != null) { sel.dir = other; paint(); sendCursor(); }
  }
  function stepWord(delta) {
    const w = wordAt(sel.i, sel.dir) || puz.words[0];
    const n = puz.words.length;
    selectWord(puz.words[(w.order + delta + n) % n]);
  }
  function moveArrow(dr, dc) {
    const dir = dc ? 'across' : 'down';
    if (sel.dir !== dir && puz.cells[sel.i][dir] != null) { sel.dir = dir; paint(); sendCursor(); return; }
    let r = puz.cells[sel.i].r + dr, c = puz.cells[sel.i].c + dc;
    while (r >= 0 && c >= 0 && r < puz.rows && c < puz.cols) {
      const i = r * puz.cols + c;
      if (puz.cells[i].ans) { select(i, sel.dir); return; }
      r += dr; c += dc;
    }
  }
  function advance() {
    const w = wordAt(sel.i, sel.dir); if (!w) return;
    const k = w.cells.indexOf(sel.i);
    const isEmpty = (ci) => !fills[ci] || !fills[ci].v;
    const after = w.cells.slice(k + 1).find(isEmpty);
    if (after != null) return select(after, sel.dir);
    const before = w.cells.slice(0, k).find(isEmpty);
    if (before != null) return select(before, sel.dir);
    if (k < w.cells.length - 1) return select(w.cells[k + 1], sel.dir);
    stepWord(1);
  }
  function retreat() {
    const w = wordAt(sel.i, sel.dir); if (!w) return;
    const k = w.cells.indexOf(sel.i);
    if (k > 0) return select(w.cells[k - 1], sel.dir);
    const n = puz.words.length;
    const prev = puz.words[(w.order - 1 + n) % n];
    select(prev.cells[prev.cells.length - 1], prev.dir);
  }

  // ---------- editing ----------
  const locked = (i) => fills[i] && fills[i].m === 'revealed';
  function put(list) {   // list of [i, fillOrNull]
    if (!list.length) return;
    list.forEach(([i, f]) => (fills[i] = f));
    afterChange();
    send({ t: 'cells', list });
  }
  function typeLetter(v) {
    if (!puz || locked(sel.i)) { advance(); return; }
    put([[sel.i, { v, by: penOf(myInk), s: myInk, p: pencil || undefined }]]);
    advance();
  }
  function backspace() {
    if (!puz) return;
    if (fills[sel.i] && fills[sel.i].v && !locked(sel.i)) { put([[sel.i, null]]); return; }
    retreat();
    if (!locked(sel.i) && fills[sel.i]) put([[sel.i, null]]);
  }
  function rebus() {
    if (!puz) return;
    const cur = fills[sel.i] ? fills[sel.i].v : '';
    const v = (prompt('Rebus — several letters in this square:', cur) || '').toUpperCase().replace(/[^A-Z0-9&]/g, '');
    if (!locked(sel.i)) put([[sel.i, v ? { v, by: penOf(myInk), s: myInk, p: pencil || undefined } : null]]);
    focusKb();
  }
  const correct = (i) => {
    const f = fills[i], a = puz.cells[i].ans;
    return !!f && !!f.v && (f.v === a || (a.length > 1 && f.v === a[0]));
  };
  function scopeCells(scope) {
    if (scope === 'cell') return [sel.i];
    if (scope === 'word') { const w = wordAt(sel.i, sel.dir); return w ? w.cells : []; }
    return puz.cells.filter((c) => c.ans).map((c) => c.i);
  }
  function check(scope) {
    const list = [];
    scopeCells(scope).forEach((i) => {
      const f = fills[i];
      if (f && f.v && !locked(i) && !correct(i)) list.push([i, Object.assign({}, f, { m: 'wrong' })]);
    });
    if (!list.length) toast('Looks right so far ✓');
    put(list);
  }
  function reveal(scope) {
    if (scope === 'all' && !confirm('Reveal the whole puzzle?')) return;
    const list = [];
    scopeCells(scope).forEach((i) => { if (!correct(i)) list.push([i, { v: puz.cells[i].ans, by: 'r', m: 'revealed' }]); });
    put(list);
  }
  function eraseAll() {
    if (!confirm('Erase every square? (Your partner\'s too.)')) return;
    const list = [];
    fills.forEach((f, i) => { if (f) list.push([i, null]); });
    elapsed = 0; tickFrom = Date.now();
    put(list);
    el.stamp.hidden = true;
  }

  let saveT;
  function afterChange() {
    checkSolved();
    paint();
    clearTimeout(saveT);
    saveT = setTimeout(saveNow, 300);
  }
  function saveNow() { if (puz) store.set(puz.date, { fills, elapsed: currentElapsed(), solved }); }

  function checkSolved(silent) {
    const open = puz.cells.filter((c) => c.ans);
    const full = open.every((c) => fills[c.i] && fills[c.i].v);
    const ok = full && open.every((c) => correct(c.i));
    if (ok && !solved) {
      elapsed = currentElapsed(); solved = true;
      el.stampTime.textContent = fmtTime(elapsed);
      el.stamp.hidden = false;
      if (!silent) toast(peerCount() ? 'Solved it together! 🎉' : 'Solved! 🎉', 4000);
    } else if (!ok && solved) {
      solved = false; tickFrom = Date.now(); el.stamp.hidden = true;
    } else if (full && !ok && !silent) {
      toast('Every square is full, but something\'s not right yet.');
    }
  }

  // ---------- timer ----------
  const currentElapsed = () => (solved || tickFrom == null ? elapsed : elapsed + (Date.now() - tickFrom));
  setInterval(() => {
    if (!puz) return;
    if (!solved) { elapsed = currentElapsed(); tickFrom = Date.now(); }
    el.timer.textContent = fmtTime(elapsed);
  }, 500);
  setInterval(saveNow, 10000);
  addEventListener('pagehide', saveNow);

  // ---------- input ----------
  function focusKb() {
    if (!puz) return;
    const d = cellEls[sel.i];
    if (d) { el.kb.style.left = d.offsetLeft + 'px'; el.kb.style.top = d.offsetTop + 'px'; }
    el.kb.focus({ preventScroll: true });
  }
  el.grid.addEventListener('pointerdown', (e) => {
    const d = e.target.closest('.cell'); if (!d || !puz) return;
    e.preventDefault();
    const i = +d.dataset.i;
    if (!puz.cells[i].ans) return;
    if (i === sel.i) toggleDir(); else select(i);
    focusKb();
  });
  el.kb.addEventListener('keydown', (e) => {
    if (!puz || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (/^[a-zA-Z0-9]$/.test(k)) { e.preventDefault(); typeLetter(k.toUpperCase()); }
    else if (k === 'Backspace') { e.preventDefault(); backspace(); }
    else if (k === 'Delete') { e.preventDefault(); if (!locked(sel.i)) put([[sel.i, null]]); }
    else if (k === 'ArrowLeft') { e.preventDefault(); moveArrow(0, -1); }
    else if (k === 'ArrowRight') { e.preventDefault(); moveArrow(0, 1); }
    else if (k === 'ArrowUp') { e.preventDefault(); moveArrow(-1, 0); }
    else if (k === 'ArrowDown') { e.preventDefault(); moveArrow(1, 0); }
    else if (k === 'Tab') { e.preventDefault(); stepWord(e.shiftKey ? -1 : 1); }
    else if (k === ' ' || k === 'Enter') { e.preventDefault(); toggleDir(); }
    else if (k === 'Escape' || k === 'Insert') { e.preventDefault(); rebus(); }
  });
  // phones with IME keyboards send keyCode 229 — read the value instead
  el.kb.addEventListener('input', () => {
    const v = el.kb.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    el.kb.value = '';
    for (const ch of v.slice(0, 25)) typeLetter(ch);
  });
  // typing anywhere on the page goes to the grid
  document.addEventListener('keydown', (e) => {
    if (document.activeElement === el.kb || !puz) return;
    const t = document.activeElement && document.activeElement.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || e.metaKey || e.ctrlKey) return;
    if (/^[a-zA-Z]$/.test(e.key) || e.key.startsWith('Arrow')) { focusKb(); el.kb.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, shiftKey: e.shiftKey })); e.preventDefault(); }
  });

  $('#prevClue').addEventListener('click', () => { stepWord(-1); focusKb(); });
  $('#nextClue').addEventListener('click', () => { stepWord(1); focusKb(); });
  $('#cluebar .cb-text').addEventListener('click', () => { toggleDir(); focusKb(); });
  el.pencilBtn.addEventListener('click', () => {
    pencil = !pencil; el.pencilBtn.setAttribute('aria-pressed', pencil); focusKb();
  });
  $('#rebusBtn').addEventListener('click', rebus);
  $('#clearBtn').addEventListener('click', eraseAll);
  document.querySelectorAll('[data-menu]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const pop = $('#menu-' + b.dataset.menu), was = pop.classList.contains('open');
    document.querySelectorAll('.pop.open').forEach((p) => p.classList.remove('open'));
    pop.classList.toggle('open', !was);
  }));
  document.addEventListener('click', () => document.querySelectorAll('.pop.open').forEach((p) => p.classList.remove('open')));
  document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
    if (!puz) return;
    (b.dataset.act === 'check' ? check : reveal)(b.dataset.scope);
    focusKb();
  }));
  $('#goBtn').addEventListener('click', () => {
    const v = el.dateIn.value;
    if (!v) return toast('Pick a date first.');
    if (v < MIN_DATE || v > MAX_DATE) return toast('The archive runs from 1976 through 2018.');
    loadPuzzle(v);
  });
  el.dateIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#goBtn').click(); });
  document.querySelectorAll('[data-dow]').forEach((b) => b.addEventListener('click', () => loadRandom(b.dataset.dow)));

  // ---------- partners (PeerJS) ----------
  let peer = null, role = 'solo', room = null;
  let host = null;          // guest: connection to host
  const conns = new Set();  // host: connections to guests
  const peerCount = () => (role === 'host' ? conns.size : role === 'guest' && host && host.open ? 1 : 0);

  function send(msg, except) {
    if (role === 'host') conns.forEach((c) => c !== except && c.open && c.send(msg));
    else if (role === 'guest' && host && host.open) host.send(msg);
  }
  let cursorT;
  function sendCursor() {
    clearTimeout(cursorT);
    cursorT = setTimeout(() => send({ t: 'cursor', ink: myInk, i: sel.i, dir: sel.dir }), 40);
  }
  function syncMsg() { return { t: 'sync', date: puz && puz.date, fills, elapsed: currentElapsed(), cursors: Object.assign({ [myInk]: { i: sel.i, dir: sel.dir } }, partners), pens: allPens() }; }
  function sendSync() { if (puz && peerCount()) send(syncMsg()); }

  async function onMessage(msg, from) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'cells' && puz && Array.isArray(msg.list)) {
      msg.list.forEach(([i, f]) => { if (puz.cells[i]) fills[i] = f; });
      afterChange();
      if (role === 'host') send(msg, from);
    } else if (msg.t === 'cursor') {
      partners[msg.ink] = { i: msg.i, dir: msg.dir };
      paint();
      if (role === 'host') send(msg, from);
    } else if (msg.t === 'pen' && PENS[msg.color]) {
      if (msg.ink !== myInk) pens[msg.ink] = msg.color;
      paint(); renderPens(); renderWho();
      if (role === 'host') send(msg, from);
    } else if (msg.t === 'sync' && msg.date) {
      if (msg.pens) for (const ink in msg.pens) if (ink !== msg.you && ink !== myInk && PENS[msg.pens[ink]]) pens[ink] = msg.pens[ink];
      if (msg.you) {
        myInk = msg.you;
        if (myPen) pens[myInk] = myPen; else delete pens[myInk];
        send({ t: 'pen', ink: myInk, color: penOf(myInk) });
        renderPens(); renderWho();
      }
      if (msg.cursors) for (const ink in msg.cursors) if (ink !== myInk) partners[ink] = msg.cursors[ink];
      if (puz && puz.date === msg.date) {
        fills = msg.fills.slice(); elapsed = msg.elapsed || 0; tickFrom = Date.now();
        solved = false; el.stamp.hidden = true; afterChange();
      } else {
        await loadPuzzle(msg.date, { fills: msg.fills, elapsed: msg.elapsed, remote: true });
        if (msg.cursors) for (const ink in msg.cursors) if (ink !== myInk) partners[ink] = msg.cursors[ink];
        paint();
      }
      if (role === 'host') send(Object.assign({}, msg, { you: undefined }), from);
      if (from === host) sendCursor();
    } else if (msg.t === 'who' && role === 'guest') {
      whoList = msg.inks || [];
      if (msg.pens) for (const ink in msg.pens) if (ink !== myInk && PENS[msg.pens[ink]]) pens[ink] = msg.pens[ink];
      renderWho(); renderPens(); paint();
    } else if (msg.t === 'left') {
      delete partners[msg.ink]; paint();
    }
  }

  let whoList = [];
  function renderWho() {
    if (role === 'host') whoList = ['a', ...[...conns].map((c) => c.ink)];
    el.who.innerHTML = '';
    whoList.forEach((ink) => {
      const li = document.createElement('li');
      const sw = document.createElement('span'); sw.style.background = colorOf(ink);
      li.append(sw, `${ink === myInk ? 'you' : 'partner'} — ${penOf(ink)} pen`);
      li.style.setProperty('--c', colorOf(ink));
      el.who.appendChild(li);
    });
    const n = peerCount();
    el.dot.className = 'dot ' + (n ? 'live' : 'wait');
    el.statusText.textContent = n ? (n === 1 ? 'Solving with a friend' : `Solving with ${n} friends`) : role === 'guest' ? 'Reconnecting…' : 'Waiting for your partner…';
  }
  function broadcastWho() { if (role === 'host') { renderWho(); send({ t: 'who', inks: whoList, pens: allPens() }); } }

  // ---------- pen picker ----------
  const penBtns = PEN_ORDER.map((name) => {
    const b = document.createElement('button');
    b.className = 'pen'; b.type = 'button';
    b.setAttribute('aria-label', name[0].toUpperCase() + name.slice(1) + ' pen');
    b.style.setProperty('--c', PENS[name]);
    b.addEventListener('click', () => choosePen(name));
    el.pens.appendChild(b);
    return b;
  });
  function renderPens() {
    const others = role === 'host' ? [...conns].map((c) => c.ink) : role === 'guest' ? whoList.filter((k) => k !== myInk) : [];
    const theirs = new Set(others.map(penOf));
    PEN_ORDER.forEach((name, k) => {
      const b = penBtns[k];
      b.setAttribute('aria-pressed', String(penOf(myInk) === name));
      b.classList.toggle('theirs', theirs.has(name));
      b.title = b.getAttribute('aria-label') + (theirs.has(name) ? ' (your partner is using this one)' : '');
    });
  }
  function choosePen(name) {
    myPen = name; pens[myInk] = name; store.set('pen', name);
    send({ t: 'pen', ink: myInk, color: name });
    renderPens(); renderWho(); focusKb();
  }
  myPen = PENS[store.get('pen')] ? store.get('pen') : null;
  if (myPen) pens[myInk] = myPen;
  renderPens();

  function showRoom() {
    el.soloBox.hidden = true; el.roomBox.hidden = false;
    el.roomCode.textContent = room;
    el.roomLink.value = location.origin + location.pathname + '?room=' + room;
    setUrl(); renderWho();
  }
  function setUrl() {
    const q = new URLSearchParams();
    if (room) q.set('room', room);
    if (puz) q.set('d', puz.date);
    try { history.replaceState(null, '', location.pathname + '?' + q); } catch (e) { /* sandboxed */ }
  }

  function newCode() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    return Array.from({ length: 5 }, () => A[Math.floor(Math.random() * A.length)]).join('');
  }

  function host_(code) {
    return new Promise((resolve, reject) => {
      if (typeof Peer === 'undefined') return reject(new Error('peerjs'));
      const p = new Peer(PEER_PREFIX + code, { debug: 0 });
      let opened = false;
      p.on('open', () => {
        opened = true; peer = p; role = 'host'; room = code; myInk = 'a';
        if (myPen) pens.a = myPen; else delete pens.a;
        showRoom(); resolve();
      });
      p.on('connection', (c) => {
        c.on('open', () => {
          const used = new Set(['a', ...[...conns].map((x) => x.ink)]);
          c.ink = INKS.find((k) => !used.has(k)) || 'd';
          conns.add(c);
          if (puz) c.send(Object.assign(syncMsg(), { you: c.ink }));
          broadcastWho();
          renderPens();
          toast('Your partner is here. Pick your pens!');
        });
        c.on('data', (m) => onMessage(m, c));
        c.on('close', () => {
          if (!conns.delete(c)) return;
          delete partners[c.ink]; delete pens[c.ink]; renderPens(); send({ t: 'left', ink: c.ink }); paint(); broadcastWho();
          toast('Your partner closed the book.');
        });
      });
      p.on('disconnected', () => { if (!p.destroyed) setTimeout(() => p.reconnect(), 1500); });
      p.on('error', (e) => { if (!opened) { p.destroy(); reject(e); } else console.warn('peer', e.type); });
    });
  }

  function join(code) {
    return new Promise((resolve, reject) => {
      if (typeof Peer === 'undefined') return reject(new Error('peerjs'));
      const p = new Peer({ debug: 0 });
      let settled = false;
      p.on('open', () => {
        const c = p.connect(PEER_PREFIX + code, { reliable: true });
        c.on('open', () => {
          settled = true; peer = p; role = 'guest'; room = code; host = c;
          showRoom(); resolve();
        });
        c.on('data', (m) => onMessage(m, c));
        c.on('close', () => {
          if (host !== c) return;
          host = null; for (const k in partners) delete partners[k]; paint(); renderWho();
          toast('Lost your partner — trying to reconnect…');
          setTimeout(() => rejoin(code), 1500);
        });
      });
      p.on('error', (e) => {
        if (!settled) { p.destroy(); reject(e); }
        else console.warn('peer', e.type);
      });
    });
  }
  // if the host left, take over the room ourselves so it stays alive
  async function rejoin(code) {
    if (peer) { peer.destroy(); peer = null; }
    role = 'solo';
    try { await join(code); }
    catch (e) {
      try { await host_(code); toast('You are now holding the room open.'); }
      catch (e2) { setTimeout(() => rejoin(code), 4000); }
    }
  }

  $('#inviteBtn').addEventListener('click', async () => {
    const btn = $('#inviteBtn');
    btn.disabled = true; btn.textContent = 'Opening room…';
    for (let k = 0; k < 3; k++) {
      try { await host_(newCode()); copyLink(true); return; }
      catch (e) { if (e.message === 'peerjs' || e.type !== 'unavailable-id') break; }
    }
    btn.disabled = false; btn.textContent = 'Invite a partner';
    toast('Could not open a room — the matchmaking server may be down. Try again.');
  });
  async function copyLink(quiet) {
    const link = el.roomLink.value;
    try { await navigator.clipboard.writeText(link); toast(quiet ? 'Room open — invite link copied. Send it to a friend.' : 'Link copied.'); }
    catch (e) { el.roomLink.select(); toast('Room open — copy the link and send it to a friend.'); }
  }
  $('#copyBtn').addEventListener('click', async () => {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title: 'Solve a crossword with me', url: el.roomLink.value }); return; } catch (e) { /* cancelled */ }
    }
    copyLink(false);
  });

  // ---------- boot ----------
  (async function boot() {
    const q = new URLSearchParams(location.search);
    const code = (q.get('room') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8);
    const date = q.get('d');
    if (code) {
      el.statusText.textContent = 'Joining room ' + code + '…';
      el.dot.className = 'dot wait';
      el.loading.textContent = 'Finding your partner…';
      try { await join(code); if (puz) return; await new Promise((r) => setTimeout(r, 4000)); if (puz) return; }
      catch (e) {
        try { await host_(code); toast('Nobody was here yet — you are holding the room open.'); }
        catch (e2) { toast('Could not join that room. Solving alone for now.'); }
      }
    }
    if (puz) return;
    if (date && date >= MIN_DATE && date <= MAX_DATE && await loadPuzzle(date)) return;
    const last = store.get('last');
    if (!code && last && await loadPuzzle(last, { quiet: true })) return;
    await loadDefault();
  })();
})();
