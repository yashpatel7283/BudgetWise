// store.js — reads and writes JSON files in the /data folder.
// This file is our "database": the project allows JSON files instead of SQL.

const fs = require("fs");
const path = require("path");

// Where the JSON files live. Defaults to the "data" folder next to this file.
// A hosting service with a persistent disk can point DATA_DIR at that disk instead.
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "data");

// Make sure the data folder exists (does nothing if it's already there).
fs.mkdirSync(DATA_DIR, { recursive: true });

// Save any JavaScript value (list, object...) as a JSON file.
function writeJson(fileName, data) {
  const filePath = path.join(DATA_DIR, fileName);
  const tempPath = filePath + ".tmp";

  // Write to a temporary file first, then rename it over the real one.
  // If the server crashes mid-write, the real file is never left half-written.
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filePath);
}

// Load a JSON file. If it doesn't exist yet, create it with `fallback`.
function readJson(fileName, fallback) {
  const filePath = path.join(DATA_DIR, fileName);

  if (!fs.existsSync(filePath)) {
    writeJson(fileName, fallback);
    return fallback;
  }

  // If the file is damaged, JSON.parse throws an error. We let it throw
  // on purpose, so we never silently overwrite data we couldn't read.
  const text = fs.readFileSync(filePath, "utf8");
  return JSON.parse(text);
}

// ---------- Users ----------
// Each user looks like:
// { id, username, email, passwordHash, createdAt }

function getUsers() {
  return readJson("users.json", []);
}

function saveUsers(users) {
  writeJson("users.json", users);
}

// ---------- Transactions ----------
// { id, userId, type, cents, category, date, note }   (money is stored in whole cents)

function getTransactions() {
  return readJson("transactions.json", []);
}

function saveTransactions(list) {
  writeJson("transactions.json", list);
}

module.exports = { readJson, writeJson, getUsers, saveUsers, getTransactions, saveTransactions };
