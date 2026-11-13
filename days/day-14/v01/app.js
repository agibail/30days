(() => {
  const $ = (s) => document.querySelector(s);
  const STORES = window.STORES, ITEMS = window.ITEMS;
  const storeById = Object.fromEntries(STORES.map((s) => [s.id, s]));
  const fmt = (n) => "$" + n.toFixed(2);

  const store = {
    get(k, d) { try { const v = localStorage.getItem("cc14-" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("cc14-" + k, JSON.stringify(v)); } catch {} },
  };

  const EXAMPLE = "milk\n2 dozen eggs\nbananas\n3 lb chicken thighs\nrice\nspinach\nolive oil\ncoffee\ntoilet paper\nhummus\nfrozen pizza";

  let state = {
    list: store.get("list", EXAMPLE),
    borough: store.get("borough", "all"),
    costco: store.get("costco", false),
    edits: store.get("edits", {}), // { "storeId:itemId": price }
    open: null,
  };

  // ---------- pricing ----------
  const roundPrice = (p) => Math.max(0.19, Math.round(p * 10) / 10 - 0.01);
  function priceOf(s, item) {
    const key = s.id + ":" + item.id;
    if (state.edits[key] != null) return { p: state.edits[key], edited: true };
    if (s.lacks && s.lacks.includes(item.id)) return null;
    const o = window.OVERRIDES[s.id];
    if (o && o[item.id] != null) return { p: o[item.id] };
    return { p: roundPrice(item.base * s.mult[item.cat]) };
  }

  // ---------- matching ----------
  const singular = (w) =>
    w.length <= 3 || w.endsWith("ss") ? w : w.endsWith("ies") ? w.slice(0, -3) + "y" : w.endsWith("oes") ? w.slice(0, -2) : w.endsWith("s") ? w.slice(0, -1) : w;
  const norm = (t) => t.toLowerCase().replace(/[^a-z0-9% ]+/g, " ").split(/\s+/).filter(Boolean).map(singular).join(" ");
  const KEYS = ITEMS.map((it) => ({ it, keys: [it.name, it.id, ...it.aliases].map(norm) }));

  function match(text) {
    const t = norm(text);
    if (!t) return null;
    let best = null, score = 0;
    for (const { it, keys } of KEYS) {
      for (const k of keys) {
        let s = 0;
        if (t === k) s = 1000;
        else if ((" " + t + " ").includes(" " + k + " ")) s = 100 + k.length;
        else if (t.length >= 3 && k.includes(t)) s = 40 + t.length;
        if (s > score) { score = s; best = it; }
      }
    }
    return best;
  }

  const UNITS = "x|lbs?|pounds?|dozens?|gallons?|gal|packs?|cans?|bags?|bunch(?:es)?|loaf|loaves|boxes|box|jars?|bottles?|rolls?|of";
  function parseLine(raw) {
    let line = raw.trim().replace(/^[-*•·•\s]+/, "").replace(/^\[.?\]\s*/, "");
    if (!line) return null;
    let qty = 1;
    let m = line.match(new RegExp("^(\\d+(?:\\.\\d+)?)(?!%)\\s*(?:(?:" + UNITS + ")\\b\\.?\\s*)*(.*)$", "i"));
    if (m && m[2]) { qty = parseFloat(m[1]); line = m[2]; }
    else if ((m = line.match(/^(.*?)\s*(?:x\s*|×\s*|,\s*)(\d+(?:\.\d+)?)$/i))) { qty = parseFloat(m[2]); line = m[1]; }
    else if ((m = line.match(/^(.*\D)\s+(\d+)$/))) { qty = parseFloat(m[2]); line = m[1]; }
    qty = Math.min(Math.max(qty, 0.25), 99);
    return { raw: raw.trim(), text: line.trim(), qty, item: match(line) };
  }

  // ---------- compute ----------
  function activeStores() {
    return STORES.filter((s) => (state.costco || !s.membership) && (state.borough === "all" || s.boroughs.includes(state.borough)));
  }

  function compute() {
    const lines = state.list.split(/\n|,|;/).map(parseLine).filter(Boolean);
    // merge duplicates
    const merged = [];
    for (const l of lines) {
      const prev = l.item && merged.find((x) => x.item === l.item);
      if (prev) prev.qty += l.qty; else merged.push(l);
    }
    const found = merged.filter((l) => l.item), missing = merged.filter((l) => !l.item);
    const stores = activeStores();

    for (const l of found) {
      l.prices = stores.map((s) => { const r = priceOf(s, l.item); return r && { s, unit: r.p, total: r.p * l.qty, edited: r.edited }; })
        .filter(Boolean).sort((a, b) => a.total - b.total);
      l.best = l.prices[0];
    }

    const tally = (ids) => {
      let total = 0, miss = 0; const pick = [];
      for (const l of found) {
        const opt = l.prices.find((p) => ids.includes(p.s.id));
        if (opt) { total += opt.total; pick.push([l, opt]); } else miss++;
      }
      return { ids, total, miss, pick };
    };
    const rank = (a, b) => a.miss - b.miss || a.total - b.total;

    const singles = stores.map((s) => tally([s.id])).sort(rank);
    const pairs = [];
    for (let i = 0; i < stores.length; i++) for (let j = i + 1; j < stores.length; j++) pairs.push(tally([stores[i].id, stores[j].id]));
    pairs.sort(rank);
    const bestPair = pairs.find((p) => new Set(p.pick.map(([, o]) => o.s.id)).size === 2) || pairs[0];

    let floor = 0; const floorStores = new Set();
    for (const l of found) if (l.best) { floor += l.best.total; floorStores.add(l.best.s.id); }
    const avg = singles.length ? singles.filter((x) => x.miss === 0).reduce((a, x, _, arr) => a + x.total / arr.length, 0) : 0;

    return { found, missing, stores, singles, bestPair, floor, floorStores, avg };
  }

  // ---------- render ----------
  const chip = (s) => `<span class="chip" style="--c:${s.color}">${s.name}</span>`;
  const qtyLabel = (l) => (l.qty === 1 ? "" : `<span class="qty">${+l.qty.toFixed(2)}×</span>`);
  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function render() {
    const r = compute();
    const out = $("#results");
    $("#storeCount").textContent = `${r.stores.length} chains in ${state.borough === "all" ? "all five boroughs" : window.BOROUGHS[state.borough]}`;

    if (!r.found.length) {
      out.innerHTML = `<div class="empty"><p>Type your list on the left, one thing per line.</p><p class="muted">Try “eggs”, “2 lb chicken”, “oat milk x2”.</p>${missingHTML(r)}</div>`;
      return;
    }

    const one = r.singles[0];
    const two = r.bestPair;
    const save = r.avg ? r.avg - one.total : 0;

    out.innerHTML = `
      <section class="verdict">
        <div class="v main">
          <div class="vlabel">Cheapest single stop</div>
          <div class="vstore">${chip(storeById[one.ids[0]])}</div>
          <div class="vprice">${fmt(one.total)}</div>
          <div class="vnote">${one.miss ? `${one.miss} item${one.miss > 1 ? "s" : ""} not carried · ` : ""}${save > 0.5 ? `${fmt(save)} under the average store` : "all items"}</div>
        </div>
        ${two ? `<div class="v">
          <div class="vlabel">Best two stops</div>
          <div class="vstore">${two.ids.map((id) => chip(storeById[id])).join('<span class="plus">+</span>')}</div>
          <div class="vprice">${fmt(two.total)}</div>
          <div class="vnote">${two.miss ? `${two.miss} not carried · ` : ""}saves ${fmt(Math.max(0, one.total - two.total))} more</div>
        </div>` : ""}
        <div class="v">
          <div class="vlabel">Rock bottom</div>
          <div class="vstore"><span class="stops">${r.floorStores.size} stop${r.floorStores.size > 1 ? "s" : ""}</span></div>
          <div class="vprice">${fmt(r.floor)}</div>
          <div class="vnote">every item at its cheapest</div>
        </div>
      </section>

      <section class="receipt">
        <div class="rhead"><span>Item</span><span>Cheapest at</span><span>Price</span></div>
        ${r.found.map((l, i) => itemHTML(l, i)).join("")}
        <div class="rtotal"><span>Rock-bottom total</span><span>${fmt(r.floor)}</span></div>
      </section>

      <section class="ranking">
        <h2>If you only go to one store</h2>
        ${(() => {
          const max = Math.max(...r.singles.map((x) => x.total));
          return r.singles.map((x, i) => {
            const s = storeById[x.ids[0]];
            return `<div class="bar ${i === 0 ? "win" : ""}">
              <span class="bname">${s.name}${s.membership ? '<em title="Membership required">*</em>' : ""}</span>
              <span class="btrack"><span class="bfill" style="width:${(x.total / max) * 100}%;--c:${s.color}"></span></span>
              <span class="bval">${fmt(x.total)}${x.miss ? `<small>−${x.miss} item${x.miss > 1 ? "s" : ""}</small>` : ""}</span>
            </div>`;
          }).join("");
        })()}
      </section>

      ${two ? `<section class="plan">
        <h2>The two-stop plan</h2>
        <div class="plancols">${two.ids.map((id) => {
          const s = storeById[id];
          const picks = two.pick.filter(([, o]) => o.s.id === id);
          return `<div class="pcol"><div class="ptitle">${chip(s)} <span>${fmt(picks.reduce((a, [, o]) => a + o.total, 0))}</span></div>
            <ul>${picks.map(([l, o]) => `<li><span>${qtyLabel(l)}${l.item.name}</span><span>${fmt(o.total)}</span></li>`).join("") || "<li class='muted'>nothing</li>"}</ul></div>`;
        }).join("")}</div>
      </section>` : ""}

      ${missingHTML(r)}
    `;
  }

  function itemHTML(l, i) {
    const b = l.best, next = l.prices[1];
    const isOpen = state.open === l.item.id;
    return `<div class="line ${isOpen ? "open" : ""}">
      <button class="lrow" data-open="${l.item.id}" aria-expanded="${isOpen}">
        <span class="lname">${qtyLabel(l)}${l.item.name}<small>${l.item.unit}${norm(l.text) !== norm(l.item.name) ? ` · from “${esc(l.text)}”` : ""}</small></span>
        <span class="lstore">${b ? chip(b.s) : "—"}${next && next.total - b.total >= 0.01 ? `<small>next: ${next.s.name} +${fmt(next.total - b.total)}</small>` : ""}</span>
        <span class="lprice">${b ? fmt(b.total) : "—"}${b && b.edited ? '<i title="Your price">•</i>' : ""}</span>
      </button>
      ${isOpen ? `<div class="grid">
        <p class="muted">Price for ${l.item.unit}. Tap a price to correct it — saved on this device.</p>
        ${l.prices.map((p) => `<div class="gcell ${p === b ? "best" : ""}">
          <span>${p.s.name}</span>
          <button class="edit" data-edit="${p.s.id}:${l.item.id}" data-val="${p.unit.toFixed(2)}">${fmt(p.unit)}${p.edited ? " •" : ""}</button>
          <a href="${p.s.search}${encodeURIComponent(l.item.name)}" target="_blank" rel="noopener" title="Search ${p.s.name}">↗</a>
        </div>`).join("")}
        ${r_notCarried(l)}
      </div>` : ""}
    </div>`;
  }

  function r_notCarried(l) {
    const have = new Set(l.prices.map((p) => p.s.id));
    const no = activeStores().filter((s) => !have.has(s.id));
    return no.length ? `<p class="muted small">Not usually stocked at: ${no.map((s) => s.name).join(", ")}</p>` : "";
  }

  function missingHTML(r) {
    if (!r.missing.length) return "";
    return `<section class="missing"><h2>Not in the price book yet</h2>
      <p>${r.missing.map((m) => `<span class="tag">${esc(m.raw)}</span>`).join(" ")}</p>
      <p class="muted small">Try a simpler name (“yogurt”, “chicken”, “cereal”).</p></section>`;
  }

  // ---------- events ----------
  const listEl = $("#list");
  listEl.value = state.list;
  let t;
  listEl.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => { state.list = listEl.value; store.set("list", state.list); render(); }, 150);
  });

  $("#boroughs").innerHTML = [["all", "All NYC"], ...Object.entries(window.BOROUGHS)]
    .map(([k, v]) => `<button data-b="${k}" class="${state.borough === k ? "on" : ""}">${v}</button>`).join("");
  $("#boroughs").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.borough = b.dataset.b; store.set("borough", state.borough);
    document.querySelectorAll("#boroughs button").forEach((x) => x.classList.toggle("on", x === b));
    render();
  });

  const cc = $("#costco");
  cc.checked = state.costco;
  cc.addEventListener("change", () => { state.costco = cc.checked; store.set("costco", state.costco); render(); });

  $("#example").addEventListener("click", () => { listEl.value = EXAMPLE; listEl.dispatchEvent(new Event("input")); });
  $("#clear").addEventListener("click", () => { listEl.value = ""; listEl.focus(); listEl.dispatchEvent(new Event("input")); });
  $("#resetPrices").addEventListener("click", () => { state.edits = {}; store.set("edits", {}); render(); });

  $("#results").addEventListener("click", (e) => {
    const o = e.target.closest("[data-open]");
    if (o) { state.open = state.open === o.dataset.open ? null : o.dataset.open; render(); return; }
    const ed = e.target.closest("[data-edit]");
    if (ed) {
      const input = document.createElement("input");
      input.type = "number"; input.step = "0.01"; input.min = "0"; input.value = ed.dataset.val; input.className = "editin";
      ed.replaceWith(input); input.focus(); input.select();
      const commit = () => {
        const v = parseFloat(input.value);
        if (!isNaN(v) && v > 0 && v.toFixed(2) !== ed.dataset.val) { state.edits[ed.dataset.edit] = v; store.set("edits", state.edits); }
        render();
      };
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (k) => { if (k.key === "Enter") input.blur(); if (k.key === "Escape") render(); });
    }
  });

  $("#updated").textContent = window.PRICE_BOOK_UPDATED;
  $("#itemCount").textContent = ITEMS.length;
  render();
})();
