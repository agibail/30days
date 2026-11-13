// Bored or Busy — a status layer for a friend-location map.
// Yellow ring = bored (open to hang). Purple ring = busy. No ring = status hidden.
// Demo data: friends are simulated around you; your own status is saved in this browser.

const HOME = [40.7291, -73.9907]; // default centre (East Village, NYC) if location isn't shared

const FRIENDS = [
  { id: 'maya',  name: 'Maya',   color: '#ff6b6b', d: [ 0.0042,  0.0031], status: 'bored', note: 'down for coffee ☕️',    place: 'Tompkins Square Park', mins: 4 },
  { id: 'jules', name: 'Jules',  color: '#4dabf7', d: [-0.0061,  0.0072], status: 'busy',  note: 'studio till 9',          place: 'Lower East Side',      mins: 12 },
  { id: 'theo',  name: 'Theo',   color: '#51cf66', d: [ 0.0105, -0.0068], status: 'bored', note: 'anyone want dumplings?', place: 'Union Square',         mins: 1 },
  { id: 'rina',  name: 'Rina',   color: '#f783ac', d: [-0.0021, -0.0049], status: 'busy',  note: 'crit in 20 min 😵',      place: 'Astor Place',          mins: 7 },
  { id: 'sol',   name: 'Sol',    color: '#ff922b', d: [ 0.0158,  0.0102], status: 'off',   note: '',                       place: 'Stuyvesant Town',      mins: 33 },
  { id: 'dani',  name: 'Dani',   color: '#20c997', d: [-0.0112, -0.0015], status: 'bored', note: 'walking around, call me', place: 'SoHo',                mins: 2 },
  { id: 'kai',   name: 'Kai',    color: '#845ef7', d: [ 0.0073, -0.0141], status: 'busy',  note: 'shift at the bar',       place: 'West Village',         mins: 18 },
  { id: 'nora',  name: 'Nora',   color: '#e8590c', d: [-0.0168,  0.0058], status: 'off',   note: '',                       place: 'Chinatown',            mins: 51 },
];

const NOTES = {
  bored: ['bored out of my mind', 'free for a bit 👀', 'park?', 'thrifting, join', 'need a lunch buddy', 'come over'],
  busy:  ['heads down', 'in class', 'at work', 'deadline mode', 'on a call', 'family dinner'],
};

const $ = (s) => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ---------- state ----------
let center = HOME;
let me = store.get('bob-me', { status: 'off', note: '', until: 0 });
if (me.until && Date.now() > me.until) me = { status: 'off', note: '', until: 0 };
let onlyBored = false;
let selected = null;
const waved = new Set();
FRIENDS.forEach((f) => { f.since = Date.now() - f.mins * 60000; });

// ---------- map ----------
const map = L.map('map', { zoomControl: false, attributionControl: true }).setView(center, 15);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19,
  attribution: 'Tiles © Esri, HERE, Garmin, © OpenStreetMap contributors',
}).addTo(map);

const initials = (n) => n.slice(0, 2).toUpperCase();
function pinIcon(p, isMe) {
  const cls = ['pin', p.status, isMe ? 'me' : '', selected === p.id ? 'selected' : '',
    onlyBored && !isMe && p.status !== 'bored' ? 'dim' : ''].join(' ');
  return L.divIcon({
    className: '', iconSize: [56, 56], iconAnchor: [28, 28], popupAnchor: [0, -30],
    html: `<div class="${cls}"><div class="ring"><div class="face" style="background:${p.color}">${isMe ? 'Me' : initials(p.name)}</div></div></div>`,
  });
}

const meMarker = L.marker(center, { icon: pinIcon({ ...me, color: '#1c1c1e' }, true), zIndexOffset: 1000 }).addTo(map);
const markers = {};
FRIENDS.forEach((f) => {
  f.pos = [center[0] + f.d[0], center[1] + f.d[1]];
  markers[f.id] = L.marker(f.pos, { icon: pinIcon(f) }).addTo(map)
    .bindPopup(() => popupHTML(f))
    .on('click', () => select(f.id, false));
});

// ---------- helpers ----------
function distance(a, b) {
  const R = 6371e3, r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  const m = 2 * R * Math.asin(Math.sqrt(h));
  const mi = m / 1609.34;
  return mi < 0.1 ? `${Math.round(m * 3.281)} ft` : `${mi.toFixed(1)} mi`;
}
function ago(t) {
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return 'now';
  if (m < 60) return `${m} min ago`;
  return `${Math.floor(m / 60)} hr ago`;
}
const label = { bored: 'Bored', busy: 'Busy' };
function popupHTML(f) {
  const tag = f.status === 'off' ? '' : `<span class="tag ${f.status}">${label[f.status]}</span>`;
  return `<div class="pop"><b>${f.name}</b>${tag}<br>${f.note ? `“${esc(f.note)}”<br>` : ''}<span class="m">${f.place} · ${distance(center, f.pos)} · ${ago(f.since)}</span></div>`;
}
function esc(s) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

// ---------- render ----------
function renderMe() {
  document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.s === me.status)));
  $('#meAv').className = `av ${me.status}`;
  $('#extras').hidden = me.status === 'off';
  $('#note').value = me.note || '';
  const left = me.until ? Math.max(0, Math.round((me.until - Date.now()) / 60000)) : 0;
  const forTxt = me.until ? ` for ${left >= 60 ? Math.round(left / 60) + ' more hr' : left + ' more min'}` : '';
  $('#meTitle').textContent = me.status === 'bored' ? "You're bored" : me.status === 'busy' ? "You're busy" : "What's your vibe?";
  $('#meSub').textContent = me.status === 'bored' ? `Yellow ring on${forTxt}. Friends can wave at you.`
    : me.status === 'busy' ? `Purple ring on${forTxt}. Friends know to leave you be.`
    : 'Pick one and your friends see a ring around you on the map.';
  meMarker.setIcon(pinIcon({ ...me, color: '#1c1c1e' }, true));
}

function renderFriends() {
  const order = { bored: 0, busy: 1, off: 2 };
  const list = FRIENDS.filter((f) => !onlyBored || f.status === 'bored')
    .sort((a, b) => order[a.status] - order[b.status] || a.mins - b.mins);
  const nBored = FRIENDS.filter((f) => f.status === 'bored').length;
  $('#countLabel').textContent = `${nBored} of ${FRIENDS.length} friends bored`;
  $('#friends').innerHTML = list.length ? list.map((f) => {
    const tag = f.status === 'off' ? '' : `<span class="tag ${f.status}">${label[f.status]}</span>`;
    const note = f.note ? `“${esc(f.note)}” · ` : '';
    const btn = f.status === 'bored'
      ? `<button class="wave" data-wave="${f.id}" ${waved.has(f.id) ? 'disabled' : ''}>${waved.has(f.id) ? 'Waved 👋' : 'Wave 👋'}</button>` : '';
    return `<li class="friend" data-id="${f.id}">
      <div class="av ${f.status}"><div style="background:${f.color}">${initials(f.name)}</div></div>
      <div class="info"><div class="name">${f.name}${tag}</div>
      <div class="meta">${note}${f.place} · ${distance(center, f.pos)}</div></div>${btn}</li>`;
  }).join('') : '<li class="empty">Nobody\'s bored right now. Be the first 🙋</li>';
  FRIENDS.forEach((f) => markers[f.id].setIcon(pinIcon(f)));
}

function select(id, fly = true) {
  selected = id;
  const f = FRIENDS.find((x) => x.id === id);
  if (fly) map.flyTo(f.pos, 16, { duration: 0.6 });
  markers[id].openPopup();
  renderFriends();
}

// ---------- events ----------
function saveMe() { store.set('bob-me', me); renderMe(); }

document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
  const s = b.dataset.s;
  const mins = +$('#until').value;
  me = { status: s, note: s === me.status ? me.note : '', until: s !== 'off' && mins ? Date.now() + mins * 60000 : 0 };
  saveMe();
  if (s === 'bored') toast('🙋 Friends nearby can see you\'re bored');
  if (s === 'busy') toast('⏳ Marked busy');
}));
$('#note').addEventListener('input', (e) => { me.note = e.target.value; store.set('bob-me', me); });
$('#until').addEventListener('change', (e) => {
  const mins = +e.target.value; me.until = mins ? Date.now() + mins * 60000 : 0; saveMe();
});
$('#filter').addEventListener('click', (e) => {
  onlyBored = !onlyBored; e.target.setAttribute('aria-pressed', String(onlyBored)); renderFriends();
  if (onlyBored) {
    const pts = FRIENDS.filter((f) => f.status === 'bored').map((f) => f.pos);
    if (pts.length) map.flyToBounds(L.latLngBounds([...pts, center]).pad(0.25), { duration: 0.6 });
  }
});
$('#friends').addEventListener('click', (e) => {
  const w = e.target.closest('[data-wave]');
  if (w) {
    e.stopPropagation();
    const f = FRIENDS.find((x) => x.id === w.dataset.wave);
    waved.add(f.id); renderFriends(); toast(`👋 Waved at ${f.name}`);
    setTimeout(() => { if (f.status === 'bored') toast(`${f.name}: “omw!! 🏃”`); }, 3200);
    return;
  }
  const li = e.target.closest('.friend');
  if (li) { if (innerWidth < 900) $('#sheet').classList.add('collapsed'); select(li.dataset.id); }
});
$('#grab').addEventListener('click', () => $('#sheet').classList.toggle('collapsed'));
map.on('click', () => { selected = null; renderFriends(); });

// ---------- liveliness: friends drift and sometimes change status ----------
setInterval(() => {
  FRIENDS.forEach((f) => {
    if (Math.random() < 0.5) return;
    f.pos = [f.pos[0] + (Math.random() - 0.5) * 0.0004, f.pos[1] + (Math.random() - 0.5) * 0.0004];
    markers[f.id].setLatLng(f.pos);
  });
}, 3000);

setInterval(() => {
  const f = FRIENDS[Math.floor(Math.random() * FRIENDS.length)];
  const next = f.status === 'bored' ? 'busy' : f.status === 'busy' ? (Math.random() < 0.5 ? 'bored' : 'off') : 'bored';
  f.status = next; f.since = Date.now(); f.mins = 0;
  f.note = next === 'off' ? '' : NOTES[next][Math.floor(Math.random() * NOTES[next].length)];
  waved.delete(f.id);
  renderFriends();
  if (next === 'bored') toast(`🟡 ${f.name} is bored`);
}, 20000);

// expire my status on time
setInterval(() => {
  if (me.until && Date.now() > me.until) { me = { status: 'off', note: '', until: 0 }; saveMe(); toast('Your status expired'); }
  else if (me.until) renderMe();
}, 30000);

// ---------- optional: centre on the real location ----------
if (navigator.geolocation && location.protocol === 'https:') {
  navigator.geolocation.getCurrentPosition((p) => {
    center = [p.coords.latitude, p.coords.longitude];
    meMarker.setLatLng(center);
    FRIENDS.forEach((f) => { f.pos = [center[0] + f.d[0], center[1] + f.d[1]]; markers[f.id].setLatLng(f.pos); });
    map.setView(center, 15);
    frame();
    renderFriends();
  }, () => {}, { timeout: 6000 });
}

// keep the map centre clear of the side panel on desktop / the sheet on phones
function frame() {
  if (innerWidth >= 900) map.panBy([-200, 0], { animate: false });
  else map.panBy([0, 70], { animate: false });
}
if (innerWidth < 900) $('#sheet').classList.add('collapsed');
map.whenReady(frame);

renderMe();
renderFriends();
