// homepage.js — the mobile menu, and the "slide up as you scroll" effect.

// ---------- Mobile navigation menu ----------
const navToggle = document.getElementById("nav-toggle");
const mainNav = document.getElementById("main-nav");

navToggle.addEventListener("click", () => {
  const isOpen = mainNav.classList.toggle("open");
  navToggle.setAttribute("aria-expanded", isOpen);
});

// ---------- Slide up when scrolled into view ----------
// Adding "js-ready" tells the CSS it may hide ".reveal" things until we show them.
// If this script fails, nothing is hidden, so the page can never end up blank.
document.documentElement.classList.add("js-ready");

const revealItems = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const watcher = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in"); // the CSS animates it into place
        watcher.unobserve(entry.target);  // only once
      }
    });
  }, { threshold: 0.15 });
  revealItems.forEach((item) => watcher.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("in")); // very old browser: just show everything
}