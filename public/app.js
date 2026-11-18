// app.js — dashboard logic: load, add, edit, delete, filter, totals.

// Categories for each type: the built-in ones plus the user's own. Filled in from /api/me when the page starts.
let CATEGORIES = { expense: [], income: [] };
let transactions = [];
let editingId = null;

const $ = (id) => document.getElementById(id);
const money = (cents) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "CAD" }).format(cents / 100);

// Talk to the server. If we're not logged in any more, go to the login page.
async function api(method, url, data) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: data ? JSON.stringify(data) : undefined,
  });
  if (res.status === 401) window.location.href = "/login.html";
  let body = {};
  try { body = await res.json(); } catch (e) { /* no JSON body */ }
  return { ok: res.ok, body };
}

// Fill the form's Category dropdown with the categories for the chosen type.
function fillFormCategories(keep) {
  const list = CATEGORIES[$("tx-type").value].slice();
  if (keep && !list.includes(keep)) list.push(keep); // an old transaction with a category that no longer exists
  fillSelect($("tx-category"), list);
  if (keep) $("tx-category").value = keep;
}

// Fill the filter's Category dropdown: expense list, income list, or both (without repeats).
function fillFilterCategories() {
  const type = $("filter-type").value;
  const list = type === "all"
    ? [...new Set([...CATEGORIES.expense, ...CATEGORIES.income])]
    : CATEGORIES[type];
  const before = $("filter-category").value;
  fillSelect($("filter-category"), list, "All categories");
  $("filter-category").value = list.includes(before) ? before : "all";
}

function fillSelect(select, options, firstLabel) {
  select.innerHTML = "";
  if (firstLabel) select.add(new Option(firstLabel, "all"));
  options.forEach((c) => select.add(new Option(c, c)));
}

// ---------- Drawing the page ----------
function render() {
  // Totals for everything
  const income = transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.cents, 0);
  const expense = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.cents, 0);
  $("stat-balance").textContent = money(income - expense);
  $("stat-income").textContent = money(income);
  $("stat-expense").textContent = money(expense);
  $("acc-count").textContent = transactions.length;

  // Live filtering
  const type = $("filter-type").value;
  const cat = $("filter-category").value;
  const shown = transactions
    .filter((t) => (type === "all" || t.type === type) && (cat === "all" || t.category === cat))
    .sort((a, b) => b.date.localeCompare(a.date));

  const net = shown.reduce((s, t) => s + (t.type === "income" ? t.cents : -t.cents), 0);
  $("filter-summary").textContent = `Showing ${shown.length} of ${transactions.length} · net ${money(net)}`;

  const list = $("tx-list");
  list.innerHTML = "";
  if (shown.length === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "No transactions yet.";
    list.appendChild(li);
  }
  shown.forEach((t, i) => {
    const li = document.createElement("li");
    li.className = "tx-row";

    const num = document.createElement("span"); // the row number: 1, 2, 3...
    num.className = "tx-num";
    num.textContent = i + 1 + ".";

    const info = document.createElement("div");
    info.className = "tx-info";
    const title = document.createElement("strong");
    title.textContent = t.category;
    const sub = document.createElement("small");
    sub.textContent = t.date + (t.note ? " · " + t.note : ""); // textContent = safe from XSS
    info.append(title, sub);

    const amt = document.createElement("span");
    amt.className = t.type === "income" ? "pos" : "neg";
    amt.textContent = (t.type === "income" ? "+" : "-") + money(t.cents);

    const edit = document.createElement("button");
    edit.className = "link-btn";
    edit.textContent = "Edit";
    edit.onclick = () => startEdit(t);

    const del = document.createElement("button");
    del.className = "link-btn danger";
    del.textContent = "Delete";
    del.onclick = () => removeTx(t.id);

    const buttons = document.createElement("div"); // keeps Edit and Delete together
    buttons.className = "tx-btns";
    buttons.append(edit, del);

    li.append(num, info, amt, buttons);
    list.appendChild(li);
  });

  drawPie("pie-income", "income");
  drawPie("pie-expense", "expense");
}

// ---------- Pie charts: income by category and expenses by category (plain SVG, no library) ----------
const SVG_NS = "http://www.w3.org/2000/svg";

// Small helper: make an SVG element, set its attributes, and optionally its text.
function svgEl(name, attrs, text) {
  const el = document.createElementNS(SVG_NS, name);
  for (const key in attrs) el.setAttribute(key, attrs[key]);
  if (text !== undefined) el.textContent = text;
  return el;
}

// Default slice colours. A category always gets the same colour (its position in the CATEGORIES list)
// unless the user picked their own.
const PALETTE = ["#5aa9e6", "#f0907a", "#f2c46b", "#7fd1b9", "#b39ddb", "#8fb8de", "#e59866", "#6f8fc4", "#d7a1b5", "#9aa7b2"];
let colorChoices = { expense: {}, income: {} }; // the user's own colours, saved on the server
function colorFor(type, category) {
  if (colorChoices[type] && colorChoices[type][category]) return colorChoices[type][category]; // user's choice wins
  let i = CATEGORIES[type].indexOf(category);
  if (i === -1) i = CATEGORIES[type].length; // an old category that no longer exists
  return PALETTE[i % PALETTE.length];
}

// A point on the circle: angle 0 = straight up, going clockwise.
function pointOnCircle(cx, cy, r, angle) {
  return [cx + r * Math.sin(angle), cy - r * Math.cos(angle)];
}

// Draw one pie into the element with the given id. type is "income" or "expense".
function drawPie(boxId, type) {
  const box = $(boxId);
  box.innerHTML = "";

  // Add up the money for each category of this type.
  const totals = {};
  transactions.filter((t) => t.type === type).forEach((t) => {
    totals[t.category] = (totals[t.category] || 0) + t.cents;
  });
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]); // biggest slice first
  const sum = entries.reduce((s, [, cents]) => s + cents, 0);

  if (sum === 0) {
    box.innerHTML = '<p class="muted">No ' + (type === "income" ? "income" : "expenses") + " yet.</p>";
    return;
  }

  const cx = 100, cy = 100, r = 90;
  const svg = svgEl("svg", {
    viewBox: "0 0 200 200",
    role: "img",
    "aria-label": (type === "income" ? "Income" : "Expenses") + " by category, pie chart",
  });

  let angle = 0; // where the next slice starts
  entries.forEach(([name, cents]) => {
    const fraction = cents / sum;
    const tip = svgEl("title", {}, `${name}: ${money(cents)} (${Math.round(fraction * 100)}%)`);
    let slice;
    if (entries.length === 1) {
      slice = svgEl("circle", { cx, cy, r, fill: colorFor(type, name) }); // one category = a full circle
    } else {
      const end = angle + fraction * 2 * Math.PI;
      const [x1, y1] = pointOnCircle(cx, cy, r, angle);
      const [x2, y2] = pointOnCircle(cx, cy, r, end);
      const large = fraction > 0.5 ? 1 : 0; // 1 = draw the long way round
      slice = svgEl("path", {
        d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`,
        fill: colorFor(type, name),
      });
      angle = end;
    }
    slice.setAttribute("stroke", "#141a22"); // same colour as the card, so slices look separated
    slice.setAttribute("stroke-width", "2");
    slice.appendChild(tip); // the hover tooltip
    svg.appendChild(slice);
  });
  box.appendChild(svg);

  // The legend under the pie: colour, category, amount, percent.
  const legend = document.createElement("ul");
  legend.className = "pie-legend";
  entries.forEach(([name, cents]) => {
    const li = document.createElement("li");
    const swatch = document.createElement("i");
    swatch.className = "swatch";
    swatch.style.background = colorFor(type, name);
    const label = document.createElement("span");
    label.textContent = name;
    const amount = document.createElement("strong");
    const pct = (cents / sum) * 100;
    amount.textContent = money(cents) + " · " + (pct < 1 ? "<1" : Math.round(pct)) + "%";
    li.append(swatch, label, amount);
    legend.appendChild(li);
  });
  box.appendChild(legend);
}

// ---------- Choosing slice colours ----------
let saveTimer = null;
function saveColors() {
  clearTimeout(saveTimer); // wait until the user stops dragging the colour picker
  saveTimer = setTimeout(() => api("PUT", "/api/colors", { colors: colorChoices }), 400);
}

// Build the colour pickers for one type (a row of colour box + name for every category).
function buildColorEditor(type) {
  const box = $("colors-" + type);
  box.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "color-grid";
  CATEGORIES[type].forEach((name) => {
    const label = document.createElement("label");
    label.className = "color-item";
    const picker = document.createElement("input");
    picker.type = "color";
    picker.value = colorFor(type, name);
    picker.setAttribute("aria-label", "Colour for " + name);
    picker.addEventListener("input", () => {
      colorChoices[type][name] = picker.value; // remember the choice
      drawPie("pie-" + type, type);            // update the pie straight away
      saveColors();
    });
    const text = document.createElement("span");
    text.textContent = name;
    label.append(picker, text);
    grid.appendChild(label);
  });
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "link-btn";
  reset.textContent = "Reset to default colours";
  reset.addEventListener("click", () => {
    colorChoices[type] = {};
    buildColorEditor(type);
    drawPie("pie-" + type, type);
    saveColors();
  });
  box.append(grid, reset);
}

["income", "expense"].forEach((type) => {
  $("colors-btn-" + type).addEventListener("click", () => {
    const box = $("colors-" + type);
    box.hidden = !box.hidden; // show or hide the pickers
  });
});

// Today's date as YYYY-MM-DD in the user's LOCAL time zone.
// (toISOString() uses UTC, which gives tomorrow's date in the evening in Canada.)
function todayLocal() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

// ---------- Form ----------
function resetForm() {
  editingId = null;
  $("tx-form").reset();
  fillFormCategories();
  $("tx-date").value = todayLocal();
  $("form-title").textContent = "Add transaction";
  $("tx-submit").textContent = "Add";
  $("tx-error").hidden = true;
}

// Show / hide the pop-up form.
function openForm() {
  $("tx-modal").hidden = false;
  $("tx-amount").focus();
}
function closeForm() {
  $("tx-modal").hidden = true;
  resetForm();
}

function startEdit(t) {
  editingId = t.id;
  $("tx-type").value = t.type;
  fillFormCategories(t.category);
  $("tx-amount").value = (t.cents / 100).toFixed(2);
  $("tx-date").value = t.date;
  $("tx-note").value = t.note;
  $("form-title").textContent = "Edit transaction";
  $("tx-submit").textContent = "Save changes";
  $("tx-error").hidden = true;
  openForm();
}

async function removeTx(id) {
  if (!confirm("Delete this transaction?")) return;
  const { ok } = await api("DELETE", "/api/transactions/" + id);
  if (ok) { transactions = transactions.filter((t) => t.id !== id); render(); }
}

$("tx-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = {
    type: $("tx-type").value,
    amount: $("tx-amount").value,
    category: $("tx-category").value,
    date: $("tx-date").value,
    note: $("tx-note").value,
  };
  // The server checks everything again; this just gives a fast answer.
  if (data.amount === "" || Number(data.amount) <= 0) {
    $("tx-error").textContent = "Enter an amount greater than 0.";
    $("tx-error").hidden = false;
    return;
  }
  const result = editingId
    ? await api("PUT", "/api/transactions/" + editingId, data)
    : await api("POST", "/api/transactions", data);

  if (!result.ok) {
    $("tx-error").textContent = result.body.error || "Could not save.";
    $("tx-error").hidden = false;
    return;
  }
  if (editingId) transactions = transactions.map((t) => (t.id === editingId ? result.body : t));
  else transactions.push(result.body);
  closeForm(); // hides the pop-up and clears the form
  render();
});

$("add-fab").addEventListener("click", () => { resetForm(); openForm(); });
$("tx-cancel").addEventListener("click", closeForm);
$("tx-modal").addEventListener("click", (e) => { if (e.target === $("tx-modal")) closeForm(); }); // click outside the card
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("tx-modal").hidden) closeForm(); });
$("tx-type").addEventListener("change", () => fillFormCategories()); // Expense <-> Income changes the category list
$("filter-type").addEventListener("change", () => { fillFilterCategories(); render(); });
$("filter-category").addEventListener("change", render);

// ---------- Start ----------
// Menu links like "/dashboard.html#add" and "#colors" end up here.
function handleHash() {
  if (location.hash === "#add") {
    resetForm();
    openForm();
  } else if (location.hash === "#colors") {
    ["income", "expense"].forEach((type) => { $("colors-" + type).hidden = false; });
    $("pie-income").scrollIntoView({ behavior: "smooth", block: "center" });
  } else {
    return;
  }
  history.replaceState(null, "", location.pathname); // clear the #word so the same link works again
}
window.addEventListener("hashchange", handleHash);

async function init() {
  const me = await api("GET", "/api/me");
  if (me.ok) {
    CATEGORIES = me.body.categories;
    $("acc-username").textContent = me.body.username;
    $("acc-email").textContent = me.body.email;
    $("acc-since").textContent = new Date(me.body.createdAt).toLocaleDateString();
    const saved = me.body.colors || {};
    colorChoices = { expense: saved.expense || {}, income: saved.income || {} };
  }
  fillFilterCategories();
  resetForm();
  buildColorEditor("income");
  buildColorEditor("expense");
  const list = await api("GET", "/api/transactions");
  if (list.ok) transactions = list.body;
  render();
  handleHash();
}
init();