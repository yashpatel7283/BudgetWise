// routes/auth.js — signup, login, logout and "who am I" endpoints.

const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const store = require("../store");
const { DEFAULT_CATEGORIES, allowedFor, cleanCustom } = require("../categories");

const router = express.Router();

// Usernames: 3-20 letters, numbers or underscores (this also blocks tricky characters).
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
// Emails: something@something.something with no spaces.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/signup
router.post("/signup", async (req, res, next) => {
  try {
    // 1. Read the input safely. Anything that isn't text becomes "" (so nothing crashes).
    const body = req.body || {};
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    // 2. Validate on the server (the browser's checks can be skipped by an attacker).
    if (username === "" || email === "" || password === "") {
      return res.status(400).json({ error: "Please fill in every field." });
    }
    if (!USERNAME_PATTERN.test(username)) {
      return res.status(400).json({
        error: "Username must be 3-20 characters: letters, numbers or underscores.",
      });
    }
    if (email.length > 100 || !EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }
    // bcrypt only uses the first 72 bytes of a password, so we refuse longer ones.
    if (Buffer.byteLength(password) > 72) {
      return res.status(400).json({ error: "Password is too long (72 bytes maximum)." });
    }

    // 3. Hash the password. We do this BEFORE reading the users file, so that
    //    the read -> check -> save steps below have no "await" in between.
    const passwordHash = await bcrypt.hash(password, 10);

    // 4. Make sure the username and email aren't already used.
    const users = store.getUsers();

    if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      return res.status(409).json({ error: "That username is already taken." });
    }
    if (users.some((u) => u.email === email)) {
      return res.status(409).json({ error: "An account with that email already exists." });
    }

    // 5. Save the new user. Only the HASH is stored, never the real password.
    const newUser = {
      id: crypto.randomUUID(),
      username: username,
      email: email,
      passwordHash: passwordHash,
      createdAt: new Date().toISOString(),
    };
    users.push(newUser);
    store.saveUsers(users);

    // 6. Log the new user in right away (fresh session id), so signup
    //    takes them straight to the dashboard without a second login step.
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = newUser.id;
      res.status(201).json({ message: "Account created.", username: newUser.username });
    });
  } catch (err) {
    next(err); // hand unexpected errors to the error handler in server.js
  }
});


// A fake hash used when the account doesn't exist, so the server takes the same
// time to answer whether or not the account is real (hides which accounts exist).
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

// POST /api/login   body: { identifier, password }   (identifier = email OR username)
router.post("/login", async (req, res, next) => {
  try {
    const body = req.body || {};
    const identifier =
      typeof body.identifier === "string" ? body.identifier.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (identifier === "" || password === "") {
      return res.status(400).json({ error: "Please fill in both fields." });
    }

    // Find the account by email or username (case-insensitive).
    const users = store.getUsers();
    const user = users.find(
      (u) => u.email === identifier || u.username.toLowerCase() === identifier
    );

    // Always run a password check, even if no user was found (see DUMMY_HASH above).
    const passwordOk = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);

    // One generic message for both cases, so attackers can't tell which part was wrong.
    if (!user || !passwordOk) {
      return res.status(401).json({ error: "Incorrect email/username or password." });
    }

    // Start a fresh session (new session id) and remember who logged in.
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = user.id;
      res.json({ message: "Logged in.", username: user.username });
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/logout
router.post("/logout", (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie("budgetwise.sid");
    res.json({ message: "Logged out." });
  });
});

// GET /api/me  — who is logged in right now?
router.get("/me", (req, res) => {
  const userId = req.session.userId;
  const user = userId ? store.getUsers().find((u) => u.id === userId) : null;

  if (!user) {
    return res.status(401).json({ error: "Not logged in." });
  }
  const custom = { expense: [], income: [], ...(user.customCategories || {}) };
  res.json({
    username: user.username,
    email: user.email,
    createdAt: user.createdAt,
    colors: user.colors || {},
    avatar: user.avatar || null,
    defaultCategories: DEFAULT_CATEGORIES,
    customCategories: custom,
    categories: { expense: allowedFor(user, "expense"), income: allowedFor(user, "income") },
  });
});

// PUT /api/colors   body: { colors: { expense: { Food: "#aabbcc" }, income: { Salary: "#112233" } } }
// Saves this user's chosen slice colours. Only known categories and #rrggbb colours are kept.
router.put("/colors", (req, res, next) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: "Not logged in." });

    const user0 = store.getUsers().find((u) => u.id === req.session.userId);
    if (!user0) return res.status(401).json({ error: "Not logged in." });

    const input = req.body && req.body.colors;
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return res.status(400).json({ error: "Send the colours as an object." });
    }

    const clean = { expense: {}, income: {} };
    for (const type of ["expense", "income"]) {
      const group = input[type];
      if (typeof group !== "object" || group === null) continue;
      for (const category of allowedFor(user0, type)) { // only categories this user is allowed to use
        const color = group[category];
        if (typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)) {
          clean[type][category] = color.toLowerCase();
        }
      }
    }

    const users = store.getUsers();
    const user = users.find((u) => u.id === req.session.userId); // only the logged-in user's record
    if (!user) return res.status(401).json({ error: "Not logged in." });
    user.colors = clean;
    store.saveUsers(users);
    res.json({ colors: clean });
  } catch (err) {
    next(err);
  }
});

// Small helper for the routes below: the logged-in user, or null.
function findUser(req, users) {
  return req.session.userId ? users.find((u) => u.id === req.session.userId) : null;
}

// PUT /api/avatar   body: { avatar: "data:image/jpeg;base64,..." }  or { avatar: null } to remove it.
// The browser shrinks the picture to a small JPEG first; here we check it is really that.
const AVATAR_PATTERN = /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+\/]+={0,2}$/;
router.put("/avatar", (req, res, next) => {
  try {
    const users = store.getUsers();
    const user = findUser(req, users);
    if (!user) return res.status(401).json({ error: "Not logged in." });

    const avatar = req.body ? req.body.avatar : undefined;
    if (avatar === null) {
      delete user.avatar;
    } else if (typeof avatar === "string" && avatar.length <= 60000 && AVATAR_PATTERN.test(avatar)) {
      user.avatar = avatar;
    } else {
      return res.status(400).json({ error: "Please choose a JPG or PNG picture." });
    }
    store.saveUsers(users);
    res.json({ avatar: user.avatar || null });
  } catch (err) {
    next(err);
  }
});

// PUT /api/password   body: { currentPassword, newPassword }
router.put("/password", async (req, res, next) => {
  try {
    const users = store.getUsers();
    const user = findUser(req, users);
    if (!user) return res.status(401).json({ error: "Not logged in." });

    const body = req.body || {};
    const current = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const next_ = typeof body.newPassword === "string" ? body.newPassword : "";

    if (current === "" || next_ === "") return res.status(400).json({ error: "Please fill in both fields." });
    if (next_.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters." });
    if (Buffer.byteLength(next_) > 72) return res.status(400).json({ error: "Password is too long (72 bytes maximum)." });
    if (!(await bcrypt.compare(current, user.passwordHash))) {
      return res.status(403).json({ error: "Your current password is not correct." });
    }

    const hash = await bcrypt.hash(next_, 10);
    // Read the users again after the await, so we never overwrite someone else's change.
    const fresh = store.getUsers();
    const again = findUser(req, fresh);
    if (!again) return res.status(401).json({ error: "Not logged in." });
    again.passwordHash = hash;
    store.saveUsers(fresh);
    res.json({ message: "Password changed." });
  } catch (err) {
    next(err);
  }
});

// PUT /api/categories   body: { custom: { expense: ["Pets"], income: ["Freelance"] } }
// Replaces this user's custom categories. The built-in ones can't be changed here.
router.put("/categories", (req, res, next) => {
  try {
    const users = store.getUsers();
    const user = findUser(req, users);
    if (!user) return res.status(401).json({ error: "Not logged in." });

    const result = cleanCustom(req.body && req.body.custom);
    if (result.error) return res.status(400).json({ error: result.error });

    user.customCategories = result.value;
    store.saveUsers(users);
    res.json({
      customCategories: result.value,
      categories: { expense: allowedFor(user, "expense"), income: allowedFor(user, "income") },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
