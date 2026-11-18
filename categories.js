// categories.js — the built-in categories, plus each user's own custom ones.
// routes/auth.js and routes/transactions.js both use this file.

const DEFAULT_CATEGORIES = {
  expense: ["Food", "Rent", "Transport", "Shopping", "Clothing", "Medical", "Bills", "Entertainment", "Education", "Other"],
  income: ["Salary", "Tip", "Bonus", "Gift", "Refund", "Investment", "Other"],
};

const MAX_CUSTOM = 15; // custom categories allowed per type
// 1-20 characters: letters, numbers, spaces, & ' -   (must start with a letter or number)
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 &'\-]{0,19}$/;

// Built-in categories + this user's custom ones, for "expense" or "income".
function allowedFor(user, type) {
  const custom = (user && user.customCategories && user.customCategories[type]) || [];
  return [...DEFAULT_CATEGORIES[type], ...custom];
}

// Turns whatever the browser sent into a clean { expense: [...], income: [...] }, or an { error }.
function cleanCustom(input) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { error: "Send the categories as an object." };
  }
  const result = { expense: [], income: [] };
  for (const type of ["expense", "income"]) {
    const list = input[type];
    if (list === undefined) continue;
    if (!Array.isArray(list)) return { error: "Categories must be lists." };
    if (list.length > MAX_CUSTOM) return { error: "You can add up to " + MAX_CUSTOM + " custom categories per type." };
    const seen = DEFAULT_CATEGORIES[type].map((n) => n.toLowerCase());
    for (const raw of list) {
      const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
      if (!NAME_PATTERN.test(name)) {
        return { error: "Category names are 1-20 characters: letters, numbers, spaces, & ' or -." };
      }
      if (seen.includes(name.toLowerCase())) {
        return { error: '"' + name + '" already exists.' };
      }
      seen.push(name.toLowerCase());
      result[type].push(name);
    }
  }
  return { value: result };
}

module.exports = { DEFAULT_CATEGORIES, MAX_CUSTOM, allowedFor, cleanCustom };
