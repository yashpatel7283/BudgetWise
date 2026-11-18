// auth.js — login and signup forms. They talk to the server with fetch.

async function postJson(url, data) {
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch (e) {
    // The request never reached the server.
    const why = window.location.protocol === "file:"
      ? "This page was opened as a file. Start the server (npm start) and open http://localhost:3000 instead."
      : "Cannot reach the server. Is it running (npm start)?";
    return { ok: false, body: { error: why } };
  }
  let body = {};
  try { body = await res.json(); } catch (e) { /* no JSON body */ }
  return { ok: res.ok, body, status: res.status };
}

function showError(box, message) {
  box.textContent = message;
  box.hidden = false;
}

const loginForm = document.getElementById("login-form");
if (loginForm) {
  const errorBox = document.getElementById("login-error");
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    const identifier = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    if (identifier.trim() === "" || password === "") {
      return showError(errorBox, "Please fill in both fields.");
    }
    const { ok, body, status } = await postJson("/api/login", { identifier, password });
    if (ok) window.location.href = "/dashboard.html";
    else showError(errorBox, body.error || "Login failed (server answered " + status + ").");
  });
}

const signupForm = document.getElementById("signup-form");
if (signupForm) {
  const errorBox = document.getElementById("signup-error");
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    const username = document.getElementById("signup-username").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;
    const confirm = document.getElementById("signup-confirm").value;
    // Quick checks for the user. The server repeats and enforces all of them.
    if (!username || !email || !password || !confirm) return showError(errorBox, "Please fill in every field.");
    if (password.length < 8) return showError(errorBox, "Password must be at least 8 characters.");
    if (password !== confirm) return showError(errorBox, "Passwords do not match.");
    const { ok, body, status } = await postJson("/api/signup", { username, email, password });
    // The server logs the new user in, so go straight to the dashboard.
    if (ok) window.location.href = "/dashboard.html";
    else showError(errorBox, body.error || "Signup failed (server answered " + status + ").");
  });
}
