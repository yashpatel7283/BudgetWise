// server.js — starts the web server and serves the front-end files.

require("dotenv").config(); // loads values from the .env file into process.env
const express = require("express");
const session = require("express-session");
const path = require("path");
const os = require("os");
const authRoutes = require("./routes/auth");
const transactionRoutes = require("./routes/transactions");
const requireAuth = require("./middleware/requireAuth");

const app = express();
const PORT = process.env.PORT || 3000;

// The session secret signs the login cookie. It must come from .env, never from the code.
if (!process.env.SESSION_SECRET) {
  console.error("Missing SESSION_SECRET. Add it to your .env file (see the steps).");
  process.exit(1);
}

app.disable("x-powered-by"); // don't advertise that the site uses Express

// When deployed behind an HTTPS hosting service, the service sits in front of our app.
// Trusting it lets the "secure" login cookie work correctly.
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

// ---------- Middleware (runs on every request, in this order) ----------

// Security headers, added to every response.
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff", // browsers must respect the declared file type
    "X-Frame-Options": "DENY", // other sites can't put our pages inside a frame
    "Referrer-Policy": "same-origin",
    // Only our own scripts may run (blocks injected scripts); Google Fonts is allowed for text fonts.
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; " +
      "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; " +
      "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  });
  next();
});

app.use(express.json()); // lets the server read JSON sent by the browser
app.use(express.urlencoded({ extended: false })); // lets it read normal form posts

// Sessions: remember who is logged in between requests, using a cookie.
app.use(
  session({
    name: "budgetwise.sid",
    secret: process.env.SESSION_SECRET,
    resave: false, // don't re-save sessions that didn't change
    saveUninitialized: false, // don't create sessions for visitors who never log in
    cookie: {
      httpOnly: true, // JavaScript in the page can't read the cookie (helps against XSS)
      sameSite: "lax", // the cookie isn't sent on most cross-site requests (helps against CSRF)
      secure: process.env.NODE_ENV === "production", // HTTPS-only when deployed
      maxAge: 1000 * 60 * 60 * 2, // log out automatically after 2 hours
    },
  })
);

// The dashboard page lives outside "public", so only logged-in users can get it.
app.get("/dashboard.html", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "dashboard.html"));
});

// The settings page is also login-only.
app.get("/settings.html", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "settings.html"));
});

// Serve every file inside the "public" folder.
// Visiting "/" shows HomePage.html.
app.use(
  express.static(path.join(__dirname, "public"), { index: "HomePage.html" })
);

// ---------- Routes ----------
app.use("/api/transactions", transactionRoutes); // all need login
app.use("/api", authRoutes); // /api/signup, /api/login, /api/logout, /api/me

// If nothing above handled the request, answer with a 404.
app.use((req, res) => {
  res.status(404).send("Page not found");
});

// Error handler: catches crashes and bad requests (like broken JSON)
// and answers with a safe message instead of exposing internal details.
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status >= 400 && err.status < 500 ? err.status : 500;
  res.status(status).json({
    error: status === 500 ? "Something went wrong on the server." : "Invalid request.",
  });
});

// ---------- Start listening ----------

// Addresses that OTHER computers on the same Wi-Fi/network can use to open the site.
function networkAddresses() {
  const found = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const info of list || []) {
      // "family" is the text "IPv4" in most Node versions and the number 4 in a few old ones.
      if ((info.family === "IPv4" || info.family === 4) && !info.internal) found.push(info.address);
    }
  }
  return found;
}

// app.listen without an address accepts connections from every network interface,
// not just this computer. That is what lets other computers open the site.
app.listen(PORT, () => {
  console.log(`BudgetWise running at http://localhost:${PORT}`);
  networkAddresses().forEach((ip) => console.log(`On your network:   http://${ip}:${PORT}`));
});
