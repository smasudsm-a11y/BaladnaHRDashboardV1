import { loadAll } from "./data.js";
import { exportPageToPPTX } from "./export.js";
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

async function main() {
  buildNav();
  wireExportButton();
  db = await loadAll();
  document.getElementById("loading").style.display = "none";
  document.getElementById("app").style.display = "flex";
  window.addEventListener("hashchange", route);
  route();
}

main().catch((err) => {
  document.getElementById("loading").textContent = `Failed to load: ${err.message}`;
  console.error(err);
});
