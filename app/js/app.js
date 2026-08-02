import { loadAll } from "./data.js";
import { exportPageToPPTX } from "./export.js";
import { signIn, signOut, onAuthStateChange } from "./auth.js";
import * as exec from "./pages/executive.js";
import * as headcount from "./pages/headcount.js";
import * as recruitment from "./pages/recruitment.js";
import * as newhires from "./pages/newhires.js";
import * as diversity from "./pages/diversity.js";
import * as compensation from "./pages/compensation.js";
import * as attrition from "./pages/attrition.js";
import * as leave from "./pages/leave.js";
import * as performance from "./pages/performance.js";
import * as training from "./pages/training.js";

const NAV = [
  { group: "Overview", pages: [exec] },
  { group: "Talent Acquisition", pages: [recruitment, newhires] },
  { group: "Workforce", pages: [headcount, diversity] },
  { group: "Rewards & Time", pages: [compensation, leave] },
  { group: "Performance & Growth", pages: [attrition, performance, training] },
];

const pagesById = new Map();
NAV.forEach((g) => g.pages.forEach((p) => pagesById.set(p.meta.id, p)));

let db = null;
let currentPage = exec;

function buildNav() {
  const nav = document.getElementById("nav");
  nav.innerHTML = "";
  NAV.forEach((g) => {
    const label = document.createElement("div");
    label.className = "nav-group-label";
    label.textContent = g.group;
    nav.appendChild(label);
    g.pages.forEach((p) => {
      const a = document.createElement("a");
      a.className = "nav-link";
      a.href = `#${p.meta.id}`;
      a.innerHTML = `<span class="nav-dot"></span><span>${p.meta.label}</span>`;
      nav.appendChild(a);
    });
  });
}

function setActive(id) {
  document.querySelectorAll(".nav-link").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("href") === `#${id}`);
  });
}

function route() {
  const id = (location.hash || "#exec").slice(1);
  const page = pagesById.get(id) || exec;
  currentPage = page;
  setActive(page.meta.id);

  const contentEl = document.getElementById("page-content");
  const filtersEl = document.getElementById("page-filters");
  const titleEl = document.getElementById("page-title");
  const subEl = document.getElementById("page-subtitle");

  contentEl.innerHTML = "";
  filtersEl.innerHTML = "";
  titleEl.textContent = page.meta.label;
  subEl.textContent = page.meta.subtitle || "";

  page.render({
    db,
    contentEl,
    filtersEl,
    setSubtitle: (t) => { subEl.textContent = t; },
  });
}

function wireExportButton() {
  document.getElementById("export-ppt-btn").addEventListener("click", (evt) => {
    const btn = evt.currentTarget;
    const original = btn.textContent;
    btn.textContent = "Exporting…";
    btn.disabled = true;
    setTimeout(() => {
      try {
        exportPageToPPTX({
          pageTitle: currentPage.meta.label,
          pageSubtitle: document.getElementById("page-subtitle").textContent,
          contentEl: document.getElementById("page-content"),
          filenamePrefix: `Baladna HR - ${currentPage.meta.label}`,
        });
      } finally {
        btn.textContent = original;
        btn.disabled = false;
      }
    }, 10);
  });
}

function showLoading(text) {
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("app").style.display = "none";
  const el = document.getElementById("loading");
  el.textContent = text;
  el.style.display = "flex";
}

function showLogin() {
  document.getElementById("loading").style.display = "none";
  document.getElementById("app").style.display = "none";
  document.getElementById("login-screen").style.display = "flex";
  document.getElementById("login-password").value = "";
}

async function showApp(session) {
  showLoading("Loading HR data…");
  try {
    db = await loadAll();
    document.getElementById("user-email").textContent = session.user.email;
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("loading").style.display = "none";
    document.getElementById("app").style.display = "flex";
    route();
  } catch (err) {
    showLoading(`Failed to load: ${err.message}`);
    console.error(err);
  }
}

function wireLoginForm() {
  const form = document.getElementById("login-form");
  const errorEl = document.getElementById("login-error");
  const submitBtn = document.getElementById("login-submit");
  form.addEventListener("submit", async (evt) => {
    evt.preventDefault();
    errorEl.style.display = "none";
    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in…";
    try {
      await signIn(
        document.getElementById("login-email").value.trim(),
        document.getElementById("login-password").value
      );
      // onAuthStateChange picks up the new session and calls showApp().
    } catch (err) {
      errorEl.textContent = err.message || "Sign-in failed. Check your email and password.";
      errorEl.style.display = "block";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Sign In";
    }
  });
}

function wireLogoutButton() {
  document.getElementById("logout-btn").addEventListener("click", async () => {
    await signOut();
    // onAuthStateChange picks up the sign-out and calls showLogin().
  });
}

async function main() {
  buildNav();
  wireExportButton();
  wireLoginForm();
  wireLogoutButton();
  window.addEventListener("hashchange", route);

  let handledUserId = undefined; // undefined = not yet handled; null = handled as signed-out
  onAuthStateChange((session) => {
    const userId = session ? session.user.id : null;
    if (userId === handledUserId) return; // ignore redundant events (e.g. token refresh)
    handledUserId = userId;
    if (session) showApp(session);
    else showLogin();
  });
}

main().catch((err) => {
  showLoading(`Failed to load: ${err.message}`);
  console.error(err);
});
