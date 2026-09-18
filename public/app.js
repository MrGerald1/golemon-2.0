// GoLemon Food Prep — responsive webapp. Every view is driven by the real backend API.
const USER = 'u_demo';
const api = async (p, o = {}) => (await fetch(p, { ...o, headers: { 'Content-Type': 'application/json', 'x-user-id': USER, ...(o.headers || {}) } })).json();
const NGN = n => '₦' + Number(n).toLocaleString();
const app = document.getElementById('app');
const SLOT_E = { Breakfast: '🌅', Lunch: '☀️', Dinner: '🌙', Dessert: '🍰' };
const SLOT_BG = { Breakfast: 'var(--cream-bg)', Lunch: 'var(--t-amber)', Dinner: 'var(--t-blue)', Dessert: 'var(--t-pink)' };

let PRODUCTS = [], cart = {}, orderId = null, sessionId = null, cur = null, curQty = 1, curPrep = false, pollTimer = null;
let PLAN = null, BASKET = [];

// Real product photos (clean product-on-white, free to use) for the universal items.
// Nigerian-specific SKUs (ugu, egusi, kpomo, agege bread...) need GoLemon's own
// photography and fall back to a tinted icon until those assets land in /img/products.
const TMDB = n => `https://www.themealdb.com/images/ingredients/${n}.png`;
const PIMG = {
  tomato: TMDB('Tomatoes'), onion: TMDB('Onion'), beef: TMDB('Beef'), chicken: TMDB('Chicken'),
  rice: TMDB('Rice'), eggs: TMDB('Eggs'), carrot: TMDB('Carrots'), sweetpotato: TMDB('Sweet%20Potatoes'),
  banana: TMDB('Banana'), pineapple: TMDB('Pineapple'), spaghetti: TMDB('Spaghetti'), bread: TMDB('Bread'),
  flour: TMDB('Flour'), sugar: TMDB('Sugar'), titus: TMDB('Fish'), catfish: TMDB('Fish'),
  greenbeans: TMDB('Green%20Beans'), tatashe: TMDB('Red%20Pepper'),
};
// tile inner: real <img> when we have one, graceful emoji fallback on missing/broken
function pic(id, emoji) {
  const u = PIMG[id];
  if (!u) return `<span class="phemoji">${emoji || '🛒'}</span>`;
  return `<img class="pimg" src="${u}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="phemoji" style="display:none">${emoji || '🛒'}</span>`;
}
const cartCount = () => Object.values(cart).reduce((a, c) => a + c.qty, 0);
const cartSub = () => Object.values(cart).reduce((a, c) => a + c.qty * c.p.price, 0);
const prepFee = () => Object.values(cart).filter(c => c.prep).length * 100;

function badge() { document.getElementById('cartBadge').textContent = cartCount(); }
function setNav(v) { document.querySelectorAll('.nlink').forEach(n => n.classList.toggle('on', n.dataset.go === v)); }
function toast(m) { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 2400); }
function modal(html, celebrate) { const m = document.getElementById('modal'); document.getElementById('modalBody').className = 'dialog' + (celebrate ? ' celebrate' : ''); document.getElementById('modalBody').innerHTML = html; m.classList.add('on'); }
function closeModal() { document.getElementById('modal').classList.remove('on'); }

async function go(v) {
  if (v === 'shop') renderShop();
  else if (v === 'cart') renderCart();
  else if (v === 'checkout') renderCheckout();
  else if (v === 'plan') await renderPlan();
  else if (v === 'fridge') await renderFridge();
  setNav(v); window.scrollTo(0, 0);
}

// ---------- SHOP ----------
function pcard(p) {
  const off = p.was ? `<div class="off">${Math.round((1 - p.price / p.was) * 100)}% off</div>` : '';
  const strike = p.was ? `<span class="strike">${NGN(p.was)}</span>` : '';
  const inc = cart[p.id];
  return `<div class="pcard" data-prod="${p.id}"><div class="img tile" style="background:${p.tint}">${off}${pic(p.id, p.emoji)}</div>
    <div class="nm">${p.name}</div><div class="un">${p.unit} · ${p.taxonomy}</div>
    <div class="pr"><div class="price">${NGN(p.price)}${strike}</div>
    <button class="addbtn ${inc ? 'in' : ''}" data-add="${p.id}">${inc ? '✓ ' + inc.qty : 'Add'}</button></div></div>`;
}
function renderShop() {
  app.innerHTML = `<div class="wrap">
    <div class="hero">
      <div class="big"><h1>Your groceries, already planned into meals.</h1>
        <p>Shop your basket — when it's delivered we turn it into a full week of breakfast, lunch &amp; dinner. No logging.</p>
        <div><button class="btn lime" data-go="plan">See how the meal plan works →</button></div></div>
      <div class="side"><b>Save up to 50% on GoLemon Misfits</b><div class="sm" style="margin-top:6px">Perfectly imperfect produce — same taste, rescued price.</div></div>
    </div>
    <div class="rowbtw"><h1>Shop fresh</h1><span class="sm">${PRODUCTS.length} items</span></div>
    <div class="chips"><div class="chip on">All</div><div class="chip">Fresh produce</div><div class="chip">Proteins</div><div class="chip">Grains</div><div class="chip">Pantry</div><div class="chip">Bakery</div></div>
    <div class="grid">${PRODUCTS.map(pcard).join('')}</div></div>`;
}

function openProduct(id) {
  cur = PRODUCTS.find(p => p.id === id); curQty = 1; curPrep = false;
  const p = cur; const off = p.was ? `<div class="off" style="position:absolute;top:10px;left:10px">${Math.round((1 - p.price / p.was) * 100)}% off</div>` : '';
  const strike = p.was ? `<span class="strike">${NGN(p.was)}</span>` : '';
  modal(`<div class="rowbtw" style="margin-bottom:14px"><h2>${p.name}</h2><span class="chev" data-close style="cursor:pointer;font-size:22px">✕</span></div>
    <div class="tile" style="height:150px;border-radius:16px;background:${p.tint};display:flex;align-items:center;justify-content:center;font-size:64px;position:relative;overflow:hidden">${off}${pic(p.id, p.emoji)}</div>
    <div class="sm" style="margin-top:12px">${p.unit} · ${p.taxonomy}</div>
    <div style="margin:8px 0 4px"><span class="price" style="font-size:22px">${NGN(p.price)}</span> ${strike}</div>
    <div class="panel" style="display:flex;align-items:center;gap:12px;margin:14px 0;cursor:pointer;box-shadow:none;border:1px solid var(--line)" data-preptoggle>
      <div style="width:40px;height:40px;border-radius:11px;background:var(--mintg-bg);display:flex;align-items:center;justify-content:center;font-size:20px">🔪</div>
      <div style="flex:1"><div style="font-weight:700;font-size:14px">Add shopping instruction</div><div class="sm" id="prepLbl">We'll dice, blend or scrape it before delivery</div></div><span class="chev" style="margin-left:0">›</span></div>
    <div class="rowbtw"><div class="sm" style="font-weight:700;color:var(--green-deep)">Quantity</div>
      <div class="qty"><button data-qd="-1">−</button><span id="qv">1</span><button data-qd="1">+</button></div></div>
    <button class="btn primary block" style="margin-top:18px" data-adddetail>Add to basket</button>`);
}

// ---------- CART ----------
function renderCart() {
  const items = Object.values(cart);
  if (!items.length) { app.innerHTML = `<div class="wrap narrow"><div class="empty"><div class="e">🧺</div><h1 style="margin-top:10px">Your basket is empty</h1><p class="sub">Add a few items and we'll plan your meals.</p><button class="btn primary" style="margin-top:20px" data-go="shop">Start shopping</button></div></div>`; return; }
  app.innerHTML = `<div class="wrap"><span class="back" data-go="shop">← Keep shopping</span><h1 style="margin-bottom:18px">Your basket</h1>
    <div class="cartlayout">
      <div class="panel">${items.map(c => `<div class="citem"><div class="e tile" style="background:${c.p.tint}">${pic(c.p.id, c.p.emoji)}</div>
        <div class="meta" style="flex:1"><div style="font-weight:600;font-size:15px">${c.p.name}</div><div class="sm">${c.p.unit} · ${NGN(c.p.price)}</div>${c.prep ? '<div class="prep">🔪 Dice — prepped for you</div>' : ''}</div>
        <div class="qty"><button data-cq="${c.p.id}|-1">−</button><span>${c.qty}</span><button data-cq="${c.p.id}|1">+</button></div></div>`).join('')}</div>
      <div class="panel">${summary()}<button class="btn primary block" style="margin-top:16px" data-go="checkout">Checkout</button></div>
    </div></div>`;
}
const summary = () => `<div class="sline"><span>Subtotal</span><span>${NGN(cartSub())}</span></div>
  <div class="sline"><span>Prep service</span><span>${NGN(prepFee())}</span></div><div class="sline"><span>Delivery</span><span>${NGN(500)}</span></div>
  <div class="sline tot"><span>Total</span><span>${NGN(cartSub() + prepFee() + 500)}</span></div>`;

function renderCheckout() {
  app.innerHTML = `<div class="wrap narrow"><span class="back" data-go="cart">← Back to basket</span><h1 style="margin-bottom:18px">Checkout</h1>
    <div class="panel" style="margin-bottom:16px"><div class="sm" style="font-weight:700;color:var(--green-deep);margin-bottom:8px">Deliver to</div>
      <div class="citem" style="border:none;padding:0"><div class="e" style="background:var(--t-blue)">📍</div><div class="meta"><div style="font-weight:600;font-size:15px">Home · Gbagada</div><div class="sm">12 Diya St, Lagos · 0803 •• ••12</div></div></div></div>
    <div class="panel" style="margin-bottom:16px"><div class="sm" style="font-weight:700;color:var(--green-deep);margin-bottom:8px">Delivery time</div>
      <div class="chips" style="margin:0"><div class="chip on">Today, 5–7pm</div><div class="chip">Tomorrow AM</div><div class="chip">Tomorrow PM</div></div></div>
    <div class="panel" style="margin-bottom:16px"><div class="sm" style="font-weight:700;color:var(--green-deep);margin-bottom:8px">Payment</div>
      <div class="chips" style="margin:0"><div class="chip on">Card •• 4412</div><div class="chip">Transfer</div><div class="chip">Pay on delivery</div></div></div>
    <div class="panel">${summary()}</div>
    <div class="note" style="background:var(--mintg-bg);color:var(--mintg-ink);margin-top:16px">🔪 We'll prep your items as you asked before delivery.</div>
    <button class="btn primary block" style="margin-top:18px" data-place>Place order · ${NGN(cartSub() + prepFee() + 500)}</button></div>`;
}
async function placeOrder() {
  const items = Object.values(cart).map(c => ({ product_id: c.p.id, qty: c.qty, prep: c.prep }));
  const r = await api('/api/orders', { method: 'POST', body: JSON.stringify({ items }) });
  orderId = r.order.id;
  app.innerHTML = `<div class="wrap narrow"><div class="empty">
    <div style="width:96px;height:96px;border-radius:50%;background:var(--mintg-bg);display:flex;align-items:center;justify-content:center;font-size:46px;margin:0 auto 18px">✅</div>
    <h1>Order placed!</h1><p class="sub" style="max-width:380px;margin:8px auto 0">We're prepping your basket now. It'll arrive <b>today, 5–7pm</b> in a reusable crate. 💚</p>
    <div class="panel" style="max-width:360px;margin:20px auto 0;text-align:left"><div class="sline"><span>Order ${r.order.id}</span><span>${NGN(r.order.total)}</span></div></div>
    <button class="btn primary" style="margin-top:22px" data-deliver>Simulate delivery →</button>
    <div class="xs" style="margin-top:10px">In production this fires automatically 30 min after delivery is confirmed.</div></div></div>`;
}
async function simulateDelivery() {
  await api('/webhooks/delivery-confirmed', { method: 'POST', body: JSON.stringify({ order_id: orderId, event_id: 'evt-' + orderId }) });
  cart = {}; badge(); toast('Your basket is home — meal plan ready 🍋');
  await renderPlan(); setNav('plan');
}

// ---------- MEAL PLAN ----------
async function renderPlan() {
  const s = await api('/api/basket-sessions/latest');
  if (s.error) { app.innerHTML = `<div class="wrap narrow"><div class="empty"><div class="e">🍋</div><h1 style="margin-top:10px">No meal plan yet</h1><p class="sub">Place an order and we'll plan your week from it.</p><button class="btn primary" style="margin-top:20px" data-go="shop">Shop now</button></div></div>`; return; }
  if (s.expired) { app.innerHTML = `<div class="wrap narrow"><div class="empty"><div class="e">🍋</div><h1 style="margin-top:10px">${s.copy}</h1></div></div>`; return; }
  sessionId = s.id; PLAN = s.brief; BASKET = PLAN.basket_items || [];
  drawPlan();
  if (s.did_you_cook) setTimeout(() => didYouCook(s.did_you_cook), 400);
}
function drawPlan() {
  const b = PLAN;
  ensureCookStyles();
  // empty-plan guard: kitchen has no full-meal makings yet
  if (!b.plan || !b.plan.length) {
    app.innerHTML = `<div class="wrap narrow"><div class="empty"><div class="e">🧺</div>
      <h1 style="margin-top:10px">Almost there</h1>
      <p class="sub">Your kitchen has bits and pieces, but not a full meal yet. Add a protein and a carb (rice, yam or plantain) and we'll plan your week.</p>
      <button class="btn primary" style="margin-top:20px" data-go="shop">Add a few items</button></div></div>`;
    return;
  }
  const COL = { red: ['var(--coral-bg)', 'var(--coral-ink)'], amber: ['var(--cream-bg)', 'var(--cream-ink)'], green: ['var(--mintg-bg)', 'var(--mintg-ink)'] };
  const shelf = b.shelf_groups.map(g => `<div class="shelfcard" style="background:${COL[g.level][0]}"><div class="hd" style="color:${COL[g.level][1]}">${g.level === 'red' ? '⏱ ' : g.level === 'amber' ? '📅 ' : '🧊 '}${g.label}</div><div class="it">${g.items.map(i => i.name + (i.days != null ? ` · ${i.days}d` : '')).join('<br>')}</div></div>`).join('');
  const days = b.plan.map((d, di) => `<div class="daycard"><div class="dayhdr"><span class="dayname">${d.today ? 'Today · ' : ''}${d.dow_short || d.label}</span><span class="daysub">${d.meals.length} meals</span></div>
    ${d.day_note ? `<div class="daynote">${d.day_note}</div>` : ''}
    ${d.meals.map((m, mi) => `<div class="meal" data-meal="${m.archetype_id}|${d.label} · ${m.slot_label}"><div class="slot" style="background:${SLOT_BG[m.slot_label]}">${SLOT_E[m.slot_label]}</div>
      <div style="flex:1"><div class="slotlabel">${m.slot_label}</div><div class="mealname">${m.name}</div>
      <div class="mealmeta"><span class="dur">⏱ ${m.minutes} min</span>${m.urgency_tag ? `<span class="mtag">${m.urgency_tag}</span>` : ''}${m.is_surprise ? '<span class="mtag lime">New combo</span>' : ''}</div></div>
      ${(m.alts && m.alts.length) ? `<button class="swapbtn" data-swap="${di}|${mi}" title="Swap this meal">⇄</button>` : ''}<span class="chev">›</span></div>`).join('')}</div>`).join('');
  app.innerHTML = `<div class="wrap"><div class="rowbtw"><h1>Your meal plan</h1><button class="btn outline" data-go="fridge" style="height:40px">🧊 Open fridge</button></div>
    <div class="cover" style="margin-top:14px"><span style="font-size:20px">🗓️</span><div><b>Your kitchen covers about ${b.coverage.days} days</b><div class="sm" style="color:var(--mintg-ink)">${b.coverage.basis || (b.coverage.item_count + ' items')} · ${b.coverage.slots.join(', ')}</div></div></div>
    ${b.first_hint ? `<div class="firsthint"><span style="font-size:17px">⏱️</span><div class="sm">${b.first_hint}</div></div>` : ''}
    <details class="sect" open style="margin-top:14px"><summary>🧊 What to use first</summary><div class="sectbody"><div class="shelf">${shelf}</div></div></details>
    <h2 style="margin:16px 0 12px">Your week</h2><div class="days">${days}</div></div>`;
}
function swapMeal(di, mi) {
  const m = PLAN.plan[di].meals[mi];
  if (!m._rot) { m._rot = [{ id: m.archetype_id, name: m.name, minutes: m.minutes, difficulty: m.difficulty, urgency_tag: m.urgency_tag, is_surprise: m.is_surprise }, ...(m.alts || [])]; m._ri = 0; }
  m._ri = (m._ri + 1) % m._rot.length;
  const pick = m._rot[m._ri];
  m.archetype_id = pick.id; m.name = pick.name; m.minutes = pick.minutes; m.difficulty = pick.difficulty;
  m.urgency_tag = pick.urgency_tag || null; m.is_surprise = !!pick.is_surprise;
  drawPlan();
  toast(m._ri === 0 ? 'Back to the original pick' : 'Swapped to ' + pick.name);
}

let recipeDepth = 'simple';
let CURRENT_RECIPE = null;
let cookIdx = 0, cookTimer = null, wakeLock = null;
const fmtT = s => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;
const asStep = s => typeof s === 'string' ? { action: s } : (s || {});
// advisory match of a free-text ingredient to a catalog product. Longest matching
// token wins, but a product the user actually has in the basket is preferred — so
// "Chicken or beef" resolves to beef when beef (not chicken) is in the basket.
function matchProduct(text, basketIds) {
  const t = (text || '').toLowerCase();
  let best = null, bestLen = 0, bestHave = null, bestHaveLen = 0;
  for (const p of PRODUCTS) {
    for (let w of p.name.toLowerCase().replace(/[()]/g, ' ').split(/\s+/)) {
      w = w.replace(/s$/, '');
      if (w.length >= 4 && t.includes(w)) {
        if (w.length > bestLen) { best = p; bestLen = w.length; }
        if (basketIds && basketIds.has(p.id) && w.length > bestHaveLen) { bestHave = p; bestHaveLen = w.length; }
      }
    }
  }
  return bestHave || best;
}

function stepHTML(raw, i) {
  const s = asStep(raw);
  const dur = s.duration_min ? `<span class="stime">⏱ ${s.duration_min}m</span>` : '';
  return `<div class="step2"><span class="n">${i + 1}</span><div class="sb">
    <div class="sact">${s.action || ''} ${dur}</div>
    ${s.cue ? `<div class="scue">✅ Done when: ${s.cue}</div>` : ''}
    ${s.why ? `<div class="swhy">💡 ${s.why}</div>` : ''}
    ${s.watch_out ? `<div class="swatch">⚠️ ${s.watch_out}</div>` : ''}
  </div></div>`;
}

async function openRecipe(id, crumb) {
  const a = await api('/api/archetypes/' + id); if (a.error) return;
  CURRENT_RECIPE = a; recipeDepth = 'simple'; ensureCookStyles();
  const dscore = (a.difficulty && a.difficulty.score) || a.difficulty_dots || 1;
  const dlabel = (a.difficulty && a.difficulty.label) || ('Difficulty ' + dscore);
  const ddrivers = (a.difficulty && a.difficulty.drivers) || [];
  const t = a.time || { total_min: a.active_minutes, prep_min: 0, active_cook_min: a.active_minutes, passive_min: 0 };
  const dots = `<span class="ddots">${[0, 1, 2, 3, 4].map(i => `<span class="dd${i < dscore ? ' on' : ''}"></span>`).join('')}</span>`;
  const basketIds = new Set(BASKET.map(x => x.id));
  const PANTRY_KW = ['palm oil', 'vegetable oil', 'groundnut oil', 'cooking oil', ' oil', 'salt', 'stock cube', 'seasoning', 'curry', 'pepper soup spice', 'nutmeg', 'sugar', 'yeast', 'water'];
  const isPantry = txt => PANTRY_KW.some(k => txt.toLowerCase().includes(k.trim()));
  const igrows = (a.ingredients || (a.what_you_need || []).map(x => ({ item: x }))).map(x => {
    const txt = x.item || '';
    const mp = matchProduct(txt, basketIds);
    const have = !!(mp && basketIds.has(mp.id));
    const staple = !have && isPantry(txt);
    const cls = have ? 'has' : staple ? 'staple' : 'needs';
    const mark = have ? '✓' : staple ? '🧂' : '○';
    const note = staple ? ' <span class="iprep">— kitchen staple</span>' : '';
    const prep = x.prep ? ` <span class="iprep">— ${x.prep}</span>` : '';
    const sub = (x.substitutes && x.substitutes.length) ? ` <span class="isub">(or ${x.substitutes.join(', ')})</span>` : '';
    return { have, staple, mp, html: `<div class="ing ${cls}"><span class="ick">${mark}</span><span><b>${x.qty ? x.qty + ' ' : ''}${txt}</b>${prep || note}${sub}</span></div>` };
  });
  const missPids = [...new Set(igrows.filter(r => !r.have && !r.staple && r.mp).map(r => r.mp.id))];
  CURRENT_RECIPE._missing = missPids;
  const haveN = igrows.filter(r => r.have).length;
  const needN = igrows.filter(r => !r.have && !r.staple).length;
  const ing = `${igrows.map(r => r.html).join('')}${missPids.length ? `<button class="btn outline block" style="margin-top:12px" data-addmissing="1">🛒 Add ${missPids.length} missing item${missPids.length > 1 ? 's' : ''} to next basket</button>` : ''}`;
  const warm = dscore <= 2 ? "An easy one — you've got this."
    : dscore === 3 ? "A little technique, but each step tells you exactly what to look for."
    : "A proper project dish — take your time; every step has your back.";
  const notes = (t.make_ahead && t.make_ahead.length)
    ? `<div class="onote ahead">📌 Make ahead: ${t.make_ahead.join(' · ')}${t.overlap_note ? ` — ${t.overlap_note}` : ''}</div>`
    : (t.overlap_note ? `<div class="onote">⏱ ${t.overlap_note}</div>` : '');
  app.innerHTML = `<div class="wrap narrow"><span class="back" data-go="plan">← Back to meal plan</span>
    <div class="xs" style="font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--muted)">${crumb}</div>
    <h1 style="margin:4px 0 6px">${a.name}</h1>
    <p class="rwarm">${warm}</p>
    <div class="diffrow">
      <details class="chipdet"><summary class="pill2">${dots} ${dlabel} · ${dscore}/5 <span class="dcaret">▾</span></summary>${ddrivers.length ? `<div class="why2"><b>Why ${dscore}/5:</b> ${ddrivers.join(' · ')}</div>` : ''}</details>
      <span class="pill2">🍽 Serves ${a.serves || 4}</span><span class="pill2">⏱ ${t.total_min} min total</span></div>
    <div class="timegrid">
      <div class="tcell big"><div class="tn">${t.total_min}</div><div class="tl">min total</div></div>
      <div class="tcell"><div class="tn">${t.prep_min || 0}</div><div class="tl">prep</div></div>
      <div class="tcell"><div class="tn">${t.active_cook_min || 0}</div><div class="tl">cooking</div></div>
      <div class="tcell"><div class="tn">${t.passive_min || 0}</div><div class="tl">hands-off</div></div></div>
    ${notes}
    ${a.is_surprise ? `<details class="sect"><summary>✨ Why this is a new combo</summary><div class="sectbody sm">${a.surprise_note || ''}</div></details>` : ''}
    <button class="btn lime block rcook" data-cook="start">▶ Cook with me, step by step</button>
    <a class="btn outline block rvideo" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${encodeURIComponent((a.name || '') + ' recipe how to')}">▶ Watch a quick video</a>
    <details class="sect" open><summary>🧺 What you need${!BASKET.length ? '' : needN > 0 ? ` · ${needN} to add` : ` · all in your kitchen 💚`}</summary><div class="sectbody">${ing}</div></details>
    <div class="rowbtw" style="align-items:center;margin:14px 0 10px"><h2>How to cook it</h2>
      <div class="depthtog"><button class="dt on" data-depth="simple">Just the steps</button><button class="dt" data-depth="full">Show the why</button></div></div>
    <div id="stepwrap" class="steps depth-simple">${(a.steps || []).map(stepHTML).join('')}</div>
    ${a.doneness_signature ? `<div class="donesig"><div class="dphoto">📸<span class="xs">photo coming</span></div><div><div class="xs" style="text-transform:uppercase;letter-spacing:.4px;color:var(--muted);font-weight:700">It's ready when</div><div class="sm" style="margin-top:3px">${a.doneness_signature}</div></div></div>` : ''}
    ${(a.rescue && a.rescue.length) ? `<details class="sect"><summary>🛟 If it goes wrong</summary><div class="sectbody">${a.rescue.map(r => `<div class="resc"><b>${r.problem}:</b> ${r.fix}</div>`).join('')}</div></details>` : ''}
    ${(a.level_up && a.level_up.length) ? `<details class="sect"><summary>⭐ Take it up a notch <span class="optq">(optional)</span></summary><div class="sectbody">${a.level_up.map(l => `<div class="resc"><b>${l.touch}:</b> ${l.how}</div>`).join('')}</div></details>` : ''}
    <div class="thumbs"><button class="tb" data-thumb="${a.id}|up">👍 Looks good</button><button class="tb" data-thumb="${a.id}|down">👎 Not for me</button></div>
    <button class="btn primary block" style="margin-top:6px" data-remind="${a.id}|${a.name}">🔔 Remind me to cook this</button></div>`;
  window.scrollTo(0, 0);
}

async function setReminder(id, name) {
  const r = await api('/api/reminders', { method: 'POST', body: JSON.stringify({ basket_session_id: sessionId, archetype_id: id, meal_name: name, demo_seconds: 5 }) });
  modal(`<div style="text-align:center"><div style="width:64px;height:64px;border-radius:50%;background:var(--mintg-bg);display:flex;align-items:center;justify-content:center;font-size:30px;margin:0 auto 14px">✅</div>
    <h2>Done. We'll remind you at 6:30 PM.</h2><p class="sm" style="margin:10px 0 16px">Tap the reminder and tonight's recipe opens.<br><span class="xs">(demo: it fires in a few seconds)</span></p>
    <button class="btn primary block" data-close>Got it</button></div>`);
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    const list = await api('/api/reminders'); const rem = list.find(x => x.id === r.reminder.id);
    if (rem && rem.state === 'fired') { clearInterval(pollTimer); closeModal(); didYouCook({ reminder_id: r.reminder.id, meal_name: name }); }
  }, 1500);
}
function didYouCook(p) {
  modal(`<div class="xs" style="font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);margin-bottom:8px">Cooking reminder · check-in</div>
    <h2 style="line-height:1.3">Time to cook ${p.meal_name}. Did you make it?</h2><p class="sm" style="margin:8px 0 16px">A quick yes helps us learn what works for you.</p>
    <button class="btn primary block" style="margin-bottom:9px" data-cooked="${p.reminder_id}|yes">Yes, I made it ✓</button>
    <button class="btn outline block" style="margin-bottom:9px" data-cooked="${p.reminder_id}|no">Not this time</button>
    <button class="btn block" style="background:transparent;color:var(--muted)" data-close>Skip</button>`);
}
async function answerCooked(rid, value) {
  closeModal(); const r = await api('/api/reminders/' + rid + '/cooked', { method: 'POST', body: JSON.stringify({ value }) });
  if (value === 'yes') {
    const n = r.meals_cooked;
    modal(`<div style="font-size:54px;margin-bottom:10px">🍲</div><div style="font-size:24px;font-weight:800;line-height:1.25">You turned your delivery into dinner.</div>
      <p style="color:#B7D6A8;font-size:15px;margin-top:12px">That's what GoLemon is for.</p>
      ${n >= 1 ? `<div style="margin-top:20px;background:rgba(205,238,99,.12);border:1px solid rgba(205,238,99,.32);border-radius:14px;padding:13px 16px"><span style="color:var(--lime);font-weight:700;font-size:14px">${n} meal${n > 1 ? 's' : ''} from GoLemon · food you didn't waste 💚</span></div>` : ''}
      <button class="btn lime block" style="margin-top:20px" data-close-go="plan">Back to my plan</button>`, true);
  } else { toast('No worries — maybe next time 💚'); }
}

// ---------- COOK MODE (hands-free stepper + live per-step timers) ----------
async function requestWake() { try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch { } }
function releaseWake() { try { wakeLock && wakeLock.release(); } catch { } wakeLock = null; }
function startCook() { if (!CURRENT_RECIPE) return; cookIdx = 0; requestWake(); renderCook(); }
function closeCook() { clearInterval(cookTimer); releaseWake(); const el = document.getElementById('cookmode'); if (el) el.remove(); }
function renderCook() {
  const a = CURRENT_RECIPE; if (!a) return;
  const steps = (a.steps || []).map(asStep); const s = steps[cookIdx]; const total = steps.length;
  const last = cookIdx >= total - 1;
  let el = document.getElementById('cookmode');
  if (!el) { el = document.createElement('div'); el.id = 'cookmode'; document.body.appendChild(el); }
  el.innerHTML = `<div class="cookwrap">
    <div class="cooktop"><span>${a.name}</span><button data-cookclose aria-label="Close">✕</button></div>
    <div class="cookprog"><i style="width:${Math.round((cookIdx + 1) / total * 100)}%"></i></div>
    <div class="cookbody">
      <div class="cookno">Step ${cookIdx + 1} of ${total}</div>
      <div class="cookact">${s.action || ''}</div>
      ${s.cue ? `<div class="cookcue">✅ Done when: ${s.cue}</div>` : ''}
      ${s.duration_min ? `<div class="cooktimer" id="ctimer">⏱ ${fmtT(s.duration_min * 60)}</div><button class="btn lime block" data-cooktimer>Start ${s.duration_min} min timer</button>` : ''}
      ${s.watch_out ? `<div class="cookwatch">⚠️ ${s.watch_out}</div>` : ''}
      <div class="cookphoto">📸<div class="xs" style="margin-top:4px">Reference photo coming soon</div></div>
    </div>
    <div class="cooknav">
      <button class="btn outline" data-cookstep="prev" ${cookIdx === 0 ? 'disabled' : ''}>← Back</button>
      ${last ? `<button class="btn lime" data-cookclose>Done cooking 🎉</button>` : `<button class="btn primary" data-cookstep="next">Next →</button>`}
    </div></div>`;
}
function startCookTimer(secs) {
  clearInterval(cookTimer); let left = secs; const el = document.getElementById('ctimer');
  cookTimer = setInterval(() => {
    left--; if (el) el.textContent = '⏱ ' + fmtT(left);
    if (left <= 0) { clearInterval(cookTimer); if (el) { el.textContent = '⏱ Time!'; el.classList.add('done'); } try { navigator.vibrate && navigator.vibrate(400); } catch { } toast('Step timer done ⏰'); }
  }, 1000);
}
function ensureCookStyles() {
  if (document.getElementById('cookcss')) return;
  const css = document.createElement('style'); css.id = 'cookcss';
  css.textContent = `
  .diffrow{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px}
  .ddots{display:inline-flex;gap:3px;vertical-align:middle;margin-right:4px}
  .ddots .dd{width:7px;height:7px;border-radius:50%;background:#CFD8CC}
  .ddots .dd.on{background:var(--green)}
  .why2{font-size:13px;color:var(--muted);line-height:1.5;margin-bottom:14px}
  .timegrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}
  .tcell{background:var(--mintg-bg);border-radius:12px;padding:10px 6px;text-align:center}
  .tcell.big{background:var(--green);color:#fff}
  .tcell .tn{font-size:20px;font-weight:800;line-height:1}
  .tcell .tl{font-size:11px;opacity:.85;margin-top:3px}
  .onote{font-size:13px;color:var(--muted);background:#F3F7EA;border-radius:10px;padding:9px 12px;margin-bottom:8px;line-height:1.45}
  .onote.ahead{color:#2E7D43}
  .ing{font-size:14px;line-height:1.5;padding:7px 0;border-bottom:1px solid rgba(0,0,0,.05)}
  .ing:last-child{border-bottom:0}
  .iprep{color:var(--muted);font-weight:500}
  .isub{color:#2E7D43;font-weight:600}
  .depthtog{display:inline-flex;background:var(--mintg-bg);border-radius:999px;padding:3px}
  .depthtog .dt{border:0;background:transparent;font:inherit;font-size:13px;font-weight:600;color:var(--muted);padding:6px 12px;border-radius:999px;cursor:pointer}
  .depthtog .dt.on{background:#fff;color:var(--ink,#15431F);box-shadow:0 1px 3px rgba(0,0,0,.12)}
  .steps .step2{display:flex;gap:12px;margin-bottom:14px}
  .steps .step2 .n{flex:none;width:26px;height:26px;border-radius:50%;background:var(--green);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px}
  .steps .sb{flex:1}
  .steps .sact{font-size:15px;line-height:1.55}
  .steps .stime{display:inline-block;font-size:12px;font-weight:700;color:var(--muted);white-space:nowrap}
  .steps .scue{font-size:13px;color:#2E7D43;font-weight:600;margin-top:5px}
  .steps .swhy{font-size:13px;color:var(--muted);margin-top:5px;line-height:1.5;border-left:2px solid #CDEE63;padding-left:9px}
  .steps .swatch{font-size:13px;color:#9A6410;background:#FCF6E8;border-radius:8px;padding:6px 9px;margin-top:6px;line-height:1.45}
  .steps .swhy,.steps .swatch{display:none}
  .steps.depth-full .swhy,.steps.depth-full .swatch{display:block}
  .donesig{display:flex;gap:12px;align-items:center;background:var(--mintg-bg);border-radius:14px;padding:12px;margin-top:6px}
  .dphoto,.cookphoto{display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--muted);background:#E7EFD7;border-radius:10px}
  .dphoto{width:64px;height:64px;flex:none;font-size:22px}
  .dphoto .xs{font-size:9px}
  .panel.rescue{background:#FCF6E8}.panel.levelup{background:#F4FAE3}
  .resc{font-size:13.5px;line-height:1.55;padding:5px 0}
  #cookmode{position:fixed;inset:0;z-index:9999;background:#15431F;color:#fff;display:flex;flex-direction:column}
  .cookwrap{max-width:560px;width:100%;margin:0 auto;display:flex;flex-direction:column;height:100%;padding:16px}
  .cooktop{display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:15px}
  .cooktop button{background:rgba(255,255,255,.15);border:0;color:#fff;width:34px;height:34px;border-radius:50%;font-size:16px;cursor:pointer}
  .cookprog{height:5px;background:rgba(255,255,255,.18);border-radius:3px;margin:12px 0 4px;overflow:hidden}
  .cookprog i{display:block;height:100%;background:var(--lime);transition:width .3s}
  .cookbody{flex:1;display:flex;flex-direction:column;justify-content:center;text-align:center;gap:14px;padding:8px 0}
  .cookno{font-size:13px;letter-spacing:.5px;text-transform:uppercase;color:var(--lime);font-weight:700}
  .cookact{font-size:23px;line-height:1.4;font-weight:600}
  .cookcue{font-size:15px;color:#CDEE63}
  .cooktimer{font-size:42px;font-weight:800;letter-spacing:1px}
  .cooktimer.done{color:var(--lime)}
  .cookwatch{font-size:14px;background:rgba(255,200,80,.16);color:#FFE2A8;border-radius:10px;padding:9px 12px;line-height:1.45}
  .cookphoto{width:120px;height:90px;align-self:center;font-size:26px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.6)}
  .cooknav{display:flex;gap:10px}
  .cooknav .btn{flex:1}
  .cooknav .btn[disabled]{opacity:.4;pointer-events:none}
  .swapbtn{flex:none;width:32px;height:32px;border-radius:50%;border:1px solid var(--line,#E3E8DD);background:#fff;color:var(--green);font-size:15px;cursor:pointer;margin-right:4px}
  .swapbtn:hover{background:var(--mintg-bg)}
  .havehint{font-size:13px;color:var(--muted);margin-bottom:10px}
  .rwarm{font-size:14.5px;color:#2E7D43;font-weight:500;margin:0 0 14px}
  .rcook{margin:2px 0 16px}
  .chipdet{display:inline-block}
  .chipdet>summary{list-style:none;cursor:pointer}
  .chipdet>summary::-webkit-details-marker{display:none}
  .chipdet .why2{margin:8px 0 2px;max-width:540px}`;
  document.head.appendChild(css);
}

// ---------- DIGITAL FRIDGE ----------
async function renderFridge() {
  const f = await api('/api/fridge');
  if (f.error || !f.groups || !f.groups.length) {
    app.innerHTML = `<div class="wrap narrow"><div class="empty"><div class="e">🧊</div><h1 style="margin-top:10px">Your digital fridge is empty</h1><p class="sub">Place an order to log fresh ingredients automatically.</p><button class="btn primary" style="margin-top:20px" data-go="shop">Start shopping</button></div></div>`;
    return;
  }
  const groups = f.groups || [];
  const itemsHTML = groups.map(g => `
    <div class="glabel"><span class="d" style="background:${g.level === 'red' ? 'var(--coral-ink)' : g.level === 'amber' ? 'var(--cream-ink)' : 'var(--mintg-ink)'}"></span>${g.label}</div>
    <div class="fgrid">${g.items.map(it => `
      <div class="fitem"><div class="e tile" style="background:${it.product.tint || 'var(--t-mint)'}">${pic(it.product.id, it.product.emoji)}</div>
        <div class="meta"><div style="font-weight:600;font-size:14px">${it.product.name}</div>
          <div class="sm">${it.qty} unit${it.qty > 1 ? 's' : ''} left</div>
          <div class="fbar"><i style="width:${Math.max(10, Math.min(100, (it.days / 7) * 100))}%;background:${it.days <= 2 ? 'var(--coral-ink)' : it.days <= 5 ? 'var(--cream-ink)' : 'var(--green)'}"></i></div>
        </div>
        <span class="fstate" style="background:${it.days <= 2 ? 'var(--coral-bg)' : it.days <= 5 ? 'var(--cream-bg)' : 'var(--mintg-bg)'};color:${it.days <= 2 ? 'var(--coral-ink)' : it.days <= 5 ? 'var(--cream-ink)' : 'var(--mintg-ink)'}">${it.days <= 0 ? 'Expired' : it.days + 'd left'}</span>
      </div>`).join('')}</div>
  `).join('');

  app.innerHTML = `<div class="wrap">
    <div class="rowbtw"><h1>Digital Fridge</h1><button class="btn primary" data-go="plan">See Meal Plan →</button></div>
    <p class="sub" style="margin-bottom:16px">Items currently in your kitchen. Fresh deliveries update this automatically.</p>
    ${itemsHTML}
  </div>`;
}

// ---------- GLOBAL EVENT DELEGATION ----------
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-go],[data-add],[data-qd],[data-cq],[data-place],[data-deliver],[data-swap],[data-meal],[data-close],[data-preptoggle],[data-adddetail],[data-addmissing],[data-depth],[data-cook],[data-cookstep],[data-cooktimer],[data-cookclose],[data-thumb],[data-remind],[data-cooked],[data-close-go],[data-prod]');
  if (!t) return;
  
  if (t.dataset.go) { go(t.dataset.go); return; }
  if (t.dataset.add) {
    e.stopPropagation();
    const id = t.dataset.add;
    const p = PRODUCTS.find(x => x.id === id);
    if (p) {
      if (!cart[id]) cart[id] = { p, qty: 1, prep: false };
      else cart[id].qty++;
      badge();
      toast(`Added ${p.name} to basket`);
      if (document.querySelector('.grid')) renderShop();
    }
    return;
  }
  if (t.dataset.qd) {
    curQty = Math.max(1, curQty + Number(t.dataset.qd));
    const el = document.getElementById('qv');
    if (el) el.textContent = curQty;
    return;
  }
  if (t.dataset.cq) {
    const [pid, delta] = t.dataset.cq.split('|');
    if (cart[pid]) {
      cart[pid].qty += Number(delta);
      if (cart[pid].qty <= 0) delete cart[pid];
      badge();
      renderCart();
    }
    return;
  }
  if (t.dataset.preptoggle) {
    curPrep = !curPrep;
    const el = document.getElementById('prepLbl');
    if (el) el.textContent = curPrep ? '✓ Instruction added (diced / blended)' : "We'll dice, blend or scrape it before delivery";
    return;
  }
  if (t.dataset.adddetail) {
    if (cur) {
      cart[cur.id] = { p: cur, qty: curQty, prep: curPrep };
      badge();
      closeModal();
      toast(`Added ${cur.name} to basket`);
      if (document.querySelector('.grid')) renderShop();
    }
    return;
  }
  if (t.dataset.place) { placeOrder(); return; }
  if (t.dataset.deliver) { simulateDelivery(); return; }
  if (t.dataset.swap) {
    e.stopPropagation();
    const [di, mi] = t.dataset.swap.split('|');
    swapMeal(Number(di), Number(mi));
    return;
  }
  if (t.dataset.meal) {
    const [id, crumb] = t.dataset.meal.split('|');
    openRecipe(id, crumb);
    return;
  }
  if (t.dataset.addmissing) {
    if (CURRENT_RECIPE && CURRENT_RECIPE._missing) {
      let added = 0;
      for (const pid of CURRENT_RECIPE._missing) {
        const p = PRODUCTS.find(x => x.id === pid);
        if (p) { cart[p.id] = { p, qty: 1, prep: false }; added++; }
      }
      badge();
      toast(`Added ${added} missing item(s) to basket`);
    }
    return;
  }
  if (t.dataset.depth) {
    recipeDepth = t.dataset.depth;
    document.querySelectorAll('.dt').forEach(b => b.classList.toggle('on', b.dataset.depth === recipeDepth));
    const sw = document.getElementById('stepwrap');
    if (sw) sw.className = 'steps depth-' + recipeDepth;
    return;
  }
  if (t.dataset.cook) { startCook(); return; }
  if (t.dataset.cookstep) {
    cookIdx += (t.dataset.cookstep === 'next' ? 1 : -1);
    renderCook();
    return;
  }
  if (t.dataset.cooktimer) {
    const s = (CURRENT_RECIPE.steps || []).map(asStep)[cookIdx];
    if (s && s.duration_min) startCookTimer(s.duration_min * 60);
    return;
  }
  if (t.dataset.cookclose) { closeCook(); return; }
  if (t.dataset.thumb) {
    const [aid, val] = t.dataset.thumb.split('|');
    document.querySelectorAll('.tb').forEach(b => b.classList.toggle('on', b.dataset.thumb === `${aid}|${val}`));
    if (sessionId) api('/api/feedback', { method: 'POST', body: JSON.stringify({ session_id: sessionId, archetype_id: aid, value: val }) });
    toast(val === 'up' ? 'Marked as liked 👍' : 'Noted — we will avoid this in future plans 👎');
    return;
  }
  if (t.dataset.remind) {
    const [aid, rname] = t.dataset.remind.split('|');
    setReminder(aid, rname);
    return;
  }
  if (t.dataset.cooked) {
    const [rid, val] = t.dataset.cooked.split('|');
    answerCooked(rid, val);
    return;
  }
  if (t.dataset.close) { closeModal(); return; }
  if (t.dataset.closeGo) { closeModal(); go(t.dataset.closeGo || 'plan'); return; }
  if (t.dataset.prod) {
    openProduct(t.dataset.prod);
    return;
  }
});

// ---------- INIT ----------
async function init() {
  PRODUCTS = await api('/api/products');
  go('shop');
}
init();
