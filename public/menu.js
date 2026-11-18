// menu.js — the drop-down menu in the top bar (used on the dashboard and the settings page).

// Shows a picture inside a round "avatar" circle, or the first letter of the name if there is no picture.
window.BW = {
  renderAvatar(el, picture, name) {
    el.innerHTML = "";
    if (picture) {
      const img = document.createElement("img");
      img.src = picture; // a small data: image saved on the server
      img.alt = "";
      el.appendChild(img);
    } else {
      el.textContent = (name || "?").charAt(0).toUpperCase();
    }
  },
};

(function () {
  const btn = document.getElementById("menu-btn");
  const menu = document.getElementById("menu");

  function setOpen(open) {
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
  }

  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(menu.hidden); // open it if it is closed, close it if it is open
  });
  menu.addEventListener("click", () => setOpen(false)); // choosing an item closes the menu
  document.addEventListener("click", (event) => {
    if (!menu.hidden && !menu.contains(event.target)) setOpen(false); // click anywhere else
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) { setOpen(false); btn.focus(); }
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    try { await fetch("/api/logout", { method: "POST" }); } catch (e) { /* go home anyway */ }
    window.location.href = "/HomePage.html";
  });

  // Fill in the name and picture of whoever is logged in.
  fetch("/api/me")
    .then((res) => (res.ok ? res.json() : null))
    .then((me) => {
      if (!me) return;
      document.getElementById("who").textContent = me.username;
      window.BW.renderAvatar(document.getElementById("menu-avatar"), me.avatar, me.username);
    })
    .catch(() => {});
})();
