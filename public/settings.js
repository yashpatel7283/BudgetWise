// settings.js — the Profile & settings page: profile picture, categories, password.

const $ = (id) => document.getElementById(id);

async function api(method, url, data) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
  } catch (e) {
    return { ok: false, status: 0, body: { error: "Cannot reach the server." } };
  }
  if (res.status === 401) window.location.href = "/login.html";
  let body = {};
  try { body = await res.json(); } catch (e) { /* no JSON body */ }
  return { ok: res.ok, status: res.status, body };
}

function say(box, text, good) {
  box.textContent = text;
  box.className = "form-msg " + (good ? "form-ok" : "form-error");
  box.hidden = false;
}

let me = null;
let custom = { expense: [], income: [] };

// ---------- Profile picture ----------
function showAvatar() {
  window.BW.renderAvatar($("avatar-preview"), me.avatar, me.username);
  window.BW.renderAvatar($("menu-avatar"), me.avatar, me.username);
  $("avatar-remove").hidden = !me.avatar;
}

// Shrink the chosen picture to a 128x128 square JPEG, so it is small to store and send.
function shrinkPicture(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file is not a picture."));
      img.onload = () => {
        const size = 128;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const side = Math.min(img.width, img.height); // crop the middle square
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff"; // behind transparent PNGs
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result; // a data: URL
    };
    reader.readAsDataURL(file);
  });
}

$("avatar-file").addEventListener("change", async () => {
  const file = $("avatar-file").files[0];
  $("avatar-file").value = ""; // so choosing the same file again still works
  if (!file) return;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return say($("avatar-msg"), "Please choose a JPG, PNG or WebP picture.", false);
  if (file.size > 8 * 1024 * 1024) return say($("avatar-msg"), "That picture is too big (8 MB maximum).", false);
  try {
    const picture = await shrinkPicture(file);
    const result = await api("PUT", "/api/avatar", { avatar: picture });
    if (!result.ok) return say($("avatar-msg"), result.body.error || "Could not save the picture.", false);
    me.avatar = result.body.avatar;
    showAvatar();
    say($("avatar-msg"), "Profile picture saved.", true);
  } catch (e) {
    say($("avatar-msg"), e.message, false);
  }
});

$("avatar-remove").addEventListener("click", async () => {
  const result = await api("PUT", "/api/avatar", { avatar: null });
  if (!result.ok) return say($("avatar-msg"), result.body.error || "Could not remove the picture.", false);
  me.avatar = null;
  showAvatar();
  say($("avatar-msg"), "Picture removed.", true);
});

// ---------- Categories ----------
function drawCategories() {
  ["expense", "income"].forEach((type) => {
    const list = $("cat-" + type);
    list.innerHTML = "";
    me.defaultCategories[type].forEach((name) => {
      const li = document.createElement("li");
      li.className = "chip";
      li.textContent = name; // built-in: no remove button
      list.appendChild(li);
    });
    custom[type].forEach((name) => {
      const li = document.createElement("li");
      li.className = "chip chip-custom";
      const text = document.createElement("span");
      text.textContent = name;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", "Remove " + name);
      remove.addEventListener("click", () => saveCategories(type, custom[type].filter((n) => n !== name)));
      li.append(text, remove);
      list.appendChild(li);
    });
  });
}

// Send the whole new list to the server. Only if it accepts do we change what is on screen.
async function saveCategories(type, newList) {
  const next = { ...custom, [type]: newList };
  const result = await api("PUT", "/api/categories", { custom: next });
  if (!result.ok) return say($("cat-msg"), result.body.error || "Could not save.", false);
  custom = result.body.customCategories;
  drawCategories();
  say($("cat-msg"), "Categories saved.", true);
  return true;
}

["expense", "income"].forEach((type) => {
  $("cat-form-" + type).addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = $("cat-input-" + type);
    const name = input.value.trim();
    if (name === "") return say($("cat-msg"), "Type a category name first.", false);
    if (await saveCategories(type, [...custom[type], name])) input.value = "";
  });
});

// ---------- Password ----------
$("pw-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const currentPassword = $("pw-current").value;
  const newPassword = $("pw-new").value;
  if (!currentPassword || !newPassword) return say($("pw-msg"), "Please fill in every field.", false);
  if (newPassword.length < 8) return say($("pw-msg"), "New password must be at least 8 characters.", false);
  if (newPassword !== $("pw-confirm").value) return say($("pw-msg"), "The new passwords do not match.", false);
  const result = await api("PUT", "/api/password", { currentPassword, newPassword });
  if (!result.ok) return say($("pw-msg"), result.body.error || "Could not change the password.", false);
  $("pw-form").reset();
  say($("pw-msg"), "Password changed.", true);
});

// ---------- Start ----------
(async function init() {
  const result = await api("GET", "/api/me");
  if (!result.ok) return;
  me = result.body;
  custom = { expense: me.customCategories.expense || [], income: me.customCategories.income || [] };
  $("profile-names").textContent = me.username + " · " + me.email;
  showAvatar();
  drawCategories();
  if (location.hash) { const target = document.getElementById(location.hash.slice(1)); if (target) target.scrollIntoView(); }
})();
