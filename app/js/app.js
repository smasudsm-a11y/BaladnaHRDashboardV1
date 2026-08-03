import { loadAll } from "./data.js";
import { exportPageToPPTX } from "./export.js";
import { signIn, signOut, onAuthStateChange } from "./auth.js";
import { getUserAccess } from "./access.js";
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
import * as attendanceViolations from "./pages/attendance-violations.js";
import * as manageAccess from "./pages/admin.js";
import * as dataRefresh from "./pages/data-refresh.js";

const NAV = [
  { group: "Overview", pages: [exec] },
  { group: "Talent Acquisition", pages: [recruitment, newhires] },
  { group: "Workforce", pages: [headcount, diversity] },
  { group: "Rewards & Time", pages: [compensation, leave] },
  { group: "Performance & Growth", pages: [attrition, performance, training] },
  { group: "Compliance", pages: [attendanceViolations] },
];

const pagesById = new Map();
NAV.forEach((g) => g.pages.forEach((p) => pagesById.set(p.meta.id, p)));

const SECTION_LIST = [];
NAV.forEach((g) => g.pages.forEach((p) => SECTION_LIST.push({ id: p.meta.id, label: p.meta.label })));

const ADMIN_PAGES = [manageAccess, dataRefresh];
const adminPagesById = new Map(ADMIN_PAGES.map((p) => [p.meta.id, p]));

let db = null;
let currentPage = exec;
let allowedIds = new Set();
let isAdmin = false;

function buildNav(allowed, showAdmin) {
  const nav = document.getElementById("nav");
  nav.innerHTML = "";
  NAV.forEach((g) => {
    const visiblePages = g.pages.filter((p) => allowed.has(p.meta.id));
    if (!visiblePages.length) return;
    const label = document.createElement("div");
    label.className = "nav-group-label";
    label.textContent = g.group;
    nav.appendChild(label);
    visiblePages.forEach((p) => {
      const a = document.createElement("a");
      a.className = "nav-link";
      a.href = `#${p.meta.id}`;
      a.innerHTML = `<span class="nav-dot"></span><span>${p.meta.label}</span>`;
      nav.appendChild(a);
    });
  });

  if (showAdmin) {
    const label = document.createElement("div");
    label.className = "nav-group-label";
    label.textContent = "Admin";
    nav.appendChild(label);
    ADMIN_PAGES.forEach((p) => {
      const a = document.createElement("a");
      a.className = "nav-link";
      a.href = `#${p.meta.id}`;
      a.innerHTML = `<span class="nav-dot"></span><span>${p.meta.label}</span>`;
      nav.appendChild(a);
    });
  }
}

function setActive(id) {
  document.querySelectorAll(".nav-link").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("href") === `#${id}`);
  });
}

function renderNoAccess() {
  document.getElementById("page-title").textContent = "No dashboard access";
  document.getElementById("page-subtitle").textContent = "";
  document.getElementById("page-filters").innerHTML = "";
  document.getElementById("page-content").innerHTML =
    `<div class="note-banner"><b>Your account doesn't have any dashboard sections assigned yet.</b> Contact your administrator to request access.</div>`;
}

function route() {
  const requested = (location.hash || "").slice(1);

  if (isAdmin && adminPagesById.has(requested)) {
    const adminPage = adminPagesById.get(requested);
    currentPage = adminPage;
    setActive(adminPage.meta.id);
    const titleEl = document.getElementById("page-title");
    const subEl = document.getElementById("page-subtitle");
    document.getElementById("page-filters").innerHTML = "";
    titleEl.textContent = adminPage.meta.label;
    subEl.textContent = adminPage.meta.subtitle || "";
    adminPage.render({ contentEl: document.getElementById("page-content"), sectionList: SECTION_LIST });
    return;
  }

  const id = allowedIds.has(requested) ? requested : (allowedIds.values().next().value || null);

  if (!id) {
    if (isAdmin) {
      history.replaceState(null, "", `#${ADMIN_PAGES[0].meta.id}`);
      route();
      return;
    }
    setActive(null);
    renderNoAccess();
    return;
  }
  if (id !== requested) {
    history.replaceState(null, "", `#${id}`);
  }

  const page = pagesById.get(id);
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
  allowedIds = new Set();
  isAdmin = false;
  document.getElementById("loading").style.display = "none";
  document.getElementById("app").style.display = "none";
  document.getElementById("login-screen").style.display = "flex";
  document.getElementById("login-password").value = "";
}

async function showApp(session) {
  showLoading("Loading HR data…");
  try {
    const access = await getUserAccess(session.user.id);
    allowedIds = access.fullAccess
      ? new Set(pagesById.keys())
      : new Set(Array.from(pagesById.keys()).filter((id) => access.sections.includes(id)));
    isAdmin = access.isAdmin;
    buildNav(allowedIds, isAdmin);

    db = await loadAll(allowedIds);
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
