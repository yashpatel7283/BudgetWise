// routes/transactions.js — create, read, update, delete transactions (per user).

const express = require("express");
const crypto = require("crypto");
const store = require("../store");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();
router.use(requireAuth); // every route below needs a logged-in user

const { allowedFor } = require("../categories"); // built-in + this user's own categories

// True only for a real calendar date written as YYYY-MM-DD.
// (Date.parse alone is not enough: it accepts "2026-02-30" and quietly turns it into March 2.)
function isRealDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [y, m, d] = text.split("-").map(Number);
  if (y < 2000 || y > 2100) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// Check the input. Returns { error } or { value } with clean data.
function clean(body, user) {
  const b = body || {};
  const date = typeof b.date === "string" ? b.date : "";
  const note = typeof b.note === "string" ? b.note.trim() : "";

  // Work out the amount in whole cents (money is stored as cents to avoid rounding errors).
  // Text must look like 12 or 12.5 or 12.50 (no letters, no "1e3").
  let cents = NaN;
  if (typeof b.amount === "number" && Number.isFinite(b.amount)) {
    cents = Math.round(b.amount * 100);
  } else if (typeof b.amount === "string" && /^\d{1,7}(\.\d{1,2})?$/.test(b.amount.trim())) {
    cents = Math.round(Number(b.amount.trim()) * 100);
  }

  if (b.type !== "income" && b.type !== "expense") return { error: "Choose income or expense." };
  if (!Number.isInteger(cents) || cents < 1 || cents > 100000000) {
    return { error: "Amount must be between 0.01 and 1,000,000 (up to 2 decimals)." };
  }
  if (!allowedFor(user, b.type).includes(b.category)) return { error: "Choose a valid category." };
  if (!isRealDate(date)) return { error: "Enter a valid date." };
  if (note.length > 100) return { error: "Note must be 100 characters or less." };

  return { value: { type: b.type, cents, category: b.category, date, note } };
}

// The logged-in user's record (needed to know their custom categories).
function currentUser(req) {
  return store.getUsers().find((u) => u.id === req.session.userId);
}

// Turn text into a safe CSV cell: quote it, and stop spreadsheets from running "=formulas".
function csvCell(value) {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

// GET /api/transactions/export.csv — download this user's transactions as a spreadsheet file.
router.get("/export.csv", (req, res) => {
  const mine = store.getTransactions()
    .filter((t) => t.userId === req.session.userId)
    .sort((a, b) => a.date.localeCompare(b.date));
  const rows = [["Date", "Type", "Category", "Amount", "Note"].map(csvCell).join(",")];
  mine.forEach((t) => {
    rows.push([t.date, t.type, t.category, (t.cents / 100).toFixed(2), t.note].map(csvCell).join(","));
  });
  res.set({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="budgetwise-transactions.csv"',
  });
  res.send(rows.join("\r\n") + "\r\n");
});

// Every lookup includes userId, so users can never reach each other's records.
router.get("/", (req, res) => {
  res.json(store.getTransactions().filter((t) => t.userId === req.session.userId));
});

router.post("/", (req, res) => {
  const result = clean(req.body, currentUser(req));
  if (result.error) return res.status(400).json({ error: result.error });

  const all = store.getTransactions();
  const t = { id: crypto.randomUUID(), userId: req.session.userId, ...result.value };
  all.push(t);
  store.saveTransactions(all);
  res.status(201).json(t);
});

router.put("/:id", (req, res) => {
  const result = clean(req.body, currentUser(req));
  if (result.error) return res.status(400).json({ error: result.error });

  const all = store.getTransactions();
  const t = all.find((x) => x.id === req.params.id && x.userId === req.session.userId);
  if (!t) return res.status(404).json({ error: "Transaction not found." });

  Object.assign(t, result.value);
  store.saveTransactions(all);
  res.json(t);
});

router.delete("/:id", (req, res) => {
  const all = store.getTransactions();
  const keep = all.filter((x) => !(x.id === req.params.id && x.userId === req.session.userId));
  if (keep.length === all.length) return res.status(404).json({ error: "Transaction not found." });

  store.saveTransactions(keep);
  res.json({ message: "Deleted." });
});

module.exports = router;
