// Lets a request through only if someone is logged in.
module.exports = function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  if (req.originalUrl.startsWith("/api")) {
    return res.status(401).json({ error: "Please log in." });
  }
  res.redirect("/login.html");
};
