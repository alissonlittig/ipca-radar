"use strict";
(async () => {
  const $ = (s) => document.querySelector(s);
  const PAL = ["#e8ecf8", "#34d399", "#60a5fa", "#f59e0b", "#f472b6", "#a78bfa", "#2dd4bf", "#fb923c", "#facc15", "#38bdf8"];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const lab = (p) => `${MON[+p.slice(4) - 1]} ${p.slice(2, 4)}`;
  const fmt = (v, d = 2) => (v == null ? "–" : v.toFixed(d).replace("-", "−") + "%");
  const sign = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(2);

  let D;
  try {
    const r = await fetch("data/ipca.json");
    if (!r.ok) throw new Error(r.status);
    D = await r.json();
  } catch (e) {
    $("#stamp").textContent = "Could not load data";
    return;
  }
  const N = D.months.length, last = N - 1;
  const G = D.groups.map((g, i) => ({ ...g, color: PAL[i % PAL.length] }));
  const head = G[0];
  const st = { per: 60, met: "acc12", sel: new Set([G[0].id, G[1].id, G[2].id, G[5].id]) };

  $("#stamp").textContent = `Data through ${lab(D.months[last])} · built ${D.generated_at.slice(0, 10)}`;

  // ---------- controls
  $("#chips").innerHTML = G.map((g) => `<button class="chip" style="--c:${g.color}" data-id="${g.id}" aria-pressed="${st.sel.has(g.id)}"><i></i>${esc(g.name)}</button>`).join("");
  $("#chips").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    const id = +b.dataset.id;
    if (st.sel.has(id)) { if (st.sel.size > 1) st.sel.delete(id); } else st.sel.add(id);
    b.setAttribute("aria-pressed", st.sel.has(id));
    drawLine();
  });
  for (const [sel, key] of [["#seg-per", "per"], ["#seg-met", "met"]]) {
    $(sel).addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      st[key] = key === "per" ? +b.dataset.v : b.dataset.v;
      $(sel).querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", x === b));
      drawLine();
    });
  }

  // ---------- KPIs
  function kpis() {
    const m = head.monthly, a = head.acc12;
    const dm = m[last] - m[last - 1];
    const a12 = a[last];
    const st12 = a12 > 4.5 ? ["Above the 4.5% ceiling", "up"] : a12 < 1.5 ? ["Below the 1.5% floor", "mid"] : ["Inside the 3% ± 1.5 band", "dn"];
    const rest = G.slice(1);
    const top = rest.reduce((x, y) => (y.acc12[last] > x.acc12[last] ? y : x));
    const hot = rest.reduce((x, y) => (y.monthly[last] > x.monthly[last] ? y : x));
    const card = (k, v, d, cls = "") => `<div class="kpi"><div class="k">${k}</div><div class="v ${cls}">${v}</div><div class="d">${d}</div></div>`;
    $("#kpis").innerHTML =
      card(`Headline · ${lab(D.months[last])}`, fmt(m[last]), `${sign(dm)} p.p. vs ${lab(D.months[last - 1])}`, dm > 0 ? "up" : "dn") +
      card("12-month inflation", fmt(a12), st12[0], st12[1]) +
      card("Highest 12-month group", fmt(top.acc12[last]), esc(top.name)) +
      card("Hottest this month", fmt(hot.monthly[last]), esc(hot.name));
  }

  // ---------- line chart
  const M = { l: 44, r: 12, t: 14, b: 28 };
  let W = 960, H = 340;
  function drawLine() {
    W = Math.max(300, Math.round($("#line").clientWidth || 960)); H = W < 520 ? 280 : 340;
    const from = st.per ? Math.max(0, N - st.per) : 0;
    const idx = Array.from({ length: N - from }, (_, i) => from + i);
    const gs = G.filter((g) => st.sel.has(g.id));
    const vals = gs.flatMap((g) => idx.map((i) => g[st.met][i])).filter((v) => v != null);
    if (st.met === "acc12") vals.push(1.5, 4.5);
    let lo = Math.min(0, ...vals), hi = Math.max(...vals);
    const step = hi - lo > 12 ? 2 : hi - lo > 6 ? 1 : 0.5;
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const x = (i) => M.l + ((i - from) / Math.max(1, N - 1 - from)) * (W - M.l - M.r);
    const y = (v) => M.t + (1 - (v - lo) / (hi - lo)) * (H - M.t - M.b);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart of IPCA ${st.met === "acc12" ? "12-month" : "monthly"} inflation by group"><g class="grid axis">`;
    for (let v = lo; v <= hi + 1e-9; v += step) s += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${M.l - 8}" y="${y(v) + 4}" text-anchor="end">${v.toFixed(step < 1 ? 1 : 0)}%</text>`;
    s += "</g>";
    if (st.met === "acc12") s += `<rect class="band" x="${M.l}" y="${y(4.5)}" width="${W - M.l - M.r}" height="${y(1.5) - y(4.5)}"/>`;
    s += `<g class="axis">`;
    const every = Math.ceil(idx.length / 7);
    idx.forEach((i, k) => { if ((idx.length - 1 - k) % every === 0) s += `<text x="${x(i)}" y="${H - 8}" text-anchor="${k === idx.length - 1 ? "end" : "middle"}">${lab(D.months[i])}</text>`; });
    s += "</g>";
    for (const g of gs) {
      const pts = idx.filter((i) => g[st.met][i] != null).map((i) => `${x(i).toFixed(1)},${y(g[st.met][i]).toFixed(1)}`);
      s += `<polyline fill="none" stroke="${g.color}" stroke-width="${g.id === head.id ? 3 : 2}" stroke-linejoin="round" stroke-linecap="round" points="${pts.join(" ")}"/>`;
    }
    s += `<line id="cx" y1="${M.t}" y2="${H - M.b}" stroke="#9aa6c7" stroke-opacity=".5" visibility="hidden"/><g id="dots"></g>`;
    s += `<rect id="hit" x="${M.l}" y="${M.t}" width="${W - M.l - M.r}" height="${H - M.t - M.b}" fill="transparent"/></svg>`;
    $("#line").innerHTML = s;
    $("#line-hint").textContent = st.met === "acc12" ? "Shaded area: official target band (3% ± 1.5 p.p.)" : "% change vs previous month";

    const svg = $("#line svg"), tip = $("#tip");
    const move = (ev) => {
      const b = svg.getBoundingClientRect();
      const px = ((ev.clientX - b.left) / b.width) * W;
      const i = Math.min(N - 1, Math.max(from, Math.round(from + ((px - M.l) / (W - M.l - M.r)) * (N - 1 - from))));
      const cx = $("#cx"); cx.setAttribute("x1", x(i)); cx.setAttribute("x2", x(i)); cx.setAttribute("visibility", "visible");
      $("#dots").innerHTML = gs.filter((g) => g[st.met][i] != null).map((g) => `<circle cx="${x(i)}" cy="${y(g[st.met][i])}" r="4.5" fill="${g.color}" stroke="#0b1020" stroke-width="2"/>`).join("");
      tip.innerHTML = `<b>${lab(D.months[i])}</b>` + gs.slice().sort((p, q) => (q[st.met][i] ?? -99) - (p[st.met][i] ?? -99)).map((g) => `<div><span><i style="background:${g.color}"></i>${esc(g.name)}</span><span>${fmt(g[st.met][i])}</span></div>`).join("");
      tip.hidden = false;
      const tw = tip.offsetWidth, left = ev.clientX + 16 + tw > innerWidth ? ev.clientX - tw - 16 : ev.clientX + 16;
      tip.style.left = Math.max(4, left) + "px"; tip.style.top = Math.max(4, Math.min(ev.clientY - 20, innerHeight - tip.offsetHeight - 4)) + "px";
    };
    const out = () => { tip.hidden = true; $("#cx").setAttribute("visibility", "hidden"); $("#dots").innerHTML = ""; };
    const hit = $("#hit");
    hit.addEventListener("pointermove", move); hit.addEventListener("pointerleave", out); hit.addEventListener("pointerdown", move);

    // accessible table (last 24 points of the selection)
    const rows = idx.slice(-24).reverse();
    $("#line-tbl").innerHTML = `<table><thead><tr><th>Month</th>${gs.map((g) => `<th>${esc(g.name)}</th>`).join("")}</tr></thead><tbody>` +
      rows.map((i) => `<tr><td>${lab(D.months[i])}</td>${gs.map((g) => `<td>${fmt(g[st.met][i])}</td>`).join("")}</tr>`).join("") + "</tbody></table>";
  }

  // ---------- ranking
  function bars() {
    const rest = G.slice(1).sort((a, b) => b.acc12[last] - a.acc12[last]);
    const mx = Math.max(...rest.map((g) => g.acc12[last]));
    $("#bar-hint").textContent = `As of ${lab(D.months[last])} · headline ${fmt(head.acc12[last])}`;
    $("#bars").innerHTML = rest.map((g) => `<div class="bar" style="--c:${g.color}"><div class="n">${esc(g.name)}<span>weight ${g.weight[last] == null ? "–" : g.weight[last].toFixed(1) + "%"}</span></div><div class="track"><div class="fill" style="width:${Math.max(2, (g.acc12[last] / mx) * 100)}%"></div></div><div class="val">${fmt(g.acc12[last])}</div></div>`).join("");
  }

  // ---------- heatmap
  function heat() {
    const idx = Array.from({ length: 12 }, (_, k) => last - 11 + k);
    const col = (v) => {
      if (v == null) return "transparent";
      const t = Math.min(1, Math.abs(v) / 1.5);
      return v >= 0 ? `rgba(190,40,75,${0.15 + 0.8 * t})` : `rgba(8,110,78,${0.2 + 0.8 * t})`;
    };
    $("#heat").innerHTML = `<table class="heat"><thead><tr><th></th>${idx.map((i) => `<th scope="col">${lab(D.months[i])}</th>`).join("")}</tr></thead><tbody>` +
      G.map((g) => `<tr><th class="r" scope="row" title="${esc(g.name)}">${esc(g.name)}</th>${idx.map((i) => `<td style="background:${col(g.monthly[i])}" title="${esc(g.name)} · ${lab(D.months[i])}: ${fmt(g.monthly[i])}">${g.monthly[i] == null ? "" : (Math.round(g.monthly[i] * 10) / 10 || 0).toFixed(1)}</td>`).join("")}</tr>`).join("") + "</tbody></table>";
  }

  kpis(); drawLine(); bars(); heat();
  $("#heat").scrollLeft = 1e4;
  let rw = innerWidth; addEventListener("resize", () => { if (innerWidth !== rw) { rw = innerWidth; drawLine(); } });
})();
