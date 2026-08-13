import { getClient } from "./supabase-client.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

// Zee's entire "access control" is this: it only ever answers from whatever
// text is captured here, and this is only ever set to whatever page the
// router (app.js) already let the user into. There is no separate
// permission check to write or get wrong — see CLAUDE.md's Zee gotcha.
let currentPageLabel = "";
let currentContextText = "";
let history = [];

// Deployed Edge Function is named "quick-handler", not "zee-chat" — Supabase
// doesn't support renaming a function after creation, and it was faster to
// repoint this URL than delete/recreate it. The source code still lives at
// supabase/functions/zee-chat/index.ts; only the deployed slug differs.
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/quick-handler`;

function textOf(el) {
  return (el?.textContent || "").replace(/\s+/g, " ").trim();
}

// Reads whatever is already rendered inside contentEl — KPI cards, every
// chart's own Chart.js instance (via Chart.getChart, the same registry
// charts.js's drilldown click handler already reads from), and any plain
// data table — into one plain-text block. This is the *entire* set of facts
// Zee can draw on for the current page; nothing else is ever sent to it.
export function buildPageContext(pageLabel, contentEl) {
  if (!contentEl) return `Page: ${pageLabel}\n(nothing rendered yet)`;

  const lines = [`Page: ${pageLabel}`, ""];

  const kpis = Array.from(contentEl.querySelectorAll(".kpi-card"));
  if (kpis.length) {
    lines.push("KPIs on screen:");
    for (const kpi of kpis) {
      const label = textOf(kpi.querySelector(".kpi-label"));
      const value = textOf(kpi.querySelector(".kpi-value"));
      const note = textOf(kpi.querySelector(".kpi-note"));
      const delta = textOf(kpi.querySelector(".kpi-delta"));
      lines.push(`- ${label}: ${value}${delta ? ` (${delta})` : ""}${note ? ` — ${note}` : ""}`);
    }
    lines.push("");
  }

  const canvases = Array.from(contentEl.querySelectorAll("canvas"));
  for (const canvas of canvases) {
    const card = canvas.closest(".card");
    const title = textOf(card?.querySelector("h3")) || "Chart";
    const sub = textOf(card?.querySelector(".card-sub"));
    const chart = typeof Chart !== "undefined" ? Chart.getChart(canvas) : null;
    if (!chart) continue;
    lines.push(`Chart "${title}"${sub ? ` (${sub})` : ""}:`);
    const labels = chart.data.labels || [];
    for (const ds of chart.data.datasets || []) {
      const pairs = labels.map((l, i) => `${l}=${ds.data[i]}`).join(", ");
      lines.push(`- ${ds.label || title}: ${pairs}`);
    }
    lines.push("");
  }

  const tables = Array.from(contentEl.querySelectorAll(".data-table"));
  for (const table of tables) {
    const headerCells = Array.from(table.querySelectorAll("thead th")).map(textOf);
    const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
    if (!headerCells.length || !bodyRows.length) continue;
    const cap = 50;
    lines.push(`Table (${headerCells.join(" | ")})${bodyRows.length > cap ? ` — showing first ${cap} of ${bodyRows.length} rows` : ""}:`);
    for (const row of bodyRows.slice(0, cap)) {
      const cells = Array.from(row.querySelectorAll("td")).map(textOf);
      lines.push(`- ${cells.join(" | ")}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

export function setPageContext(pageLabel, contentEl) {
  currentPageLabel = pageLabel || "";
  currentContextText = buildPageContext(currentPageLabel, contentEl);
  history = []; // new page, new conversation — Zee shouldn't carry over context across pages
  const messagesEl = document.getElementById("zee-messages");
  if (messagesEl) messagesEl.innerHTML = "";
}

function addMessage(role, text) {
  const messagesEl = document.getElementById("zee-messages");
  if (!messagesEl) return;
  const bubble = document.createElement("div");
  bubble.className = `zee-message zee-message-${role}`;
  bubble.textContent = text;
  messagesEl.appendChild(bubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return bubble;
}

async function sendQuestion(question) {
  addMessage("user", question);
  const thinking = addMessage("bot", "Zee is thinking…");
  thinking.classList.add("zee-message-pending");

  try {
    const client = getClient();
    const { data: sessionData } = await client.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      thinking.textContent = "You need to be signed in for Zee to help.";
      thinking.classList.remove("zee-message-pending");
      return;
    }

    const res = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        pageLabel: currentPageLabel,
        contextText: currentContextText,
        question,
        history,
      }),
    });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok || payload.error) {
      thinking.textContent = payload.error || "Something went wrong — try again in a moment.";
      thinking.classList.remove("zee-message-pending");
      return;
    }

    thinking.textContent = payload.answer;
    thinking.classList.remove("zee-message-pending");
    history.push({ role: "user", content: question });
    history.push({ role: "assistant", content: payload.answer });
  } catch (err) {
    thinking.textContent = "Couldn't reach Zee — check your connection and try again.";
    thinking.classList.remove("zee-message-pending");
    console.error(err);
  }
}

const AVATAR_SVG = `
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Zee avatar">
  <circle cx="32" cy="32" r="32" fill="var(--brand-primary)"/>
  <path d="M32 10c-11 0-16 8-16 17 0 6 2 11 4 14-1 4-3 8-3 8s7-1 11-4c1.3.4 2.6.6 4 .6 11 0 18-8 18-18.6C50 17 43 10 32 10Z" fill="var(--brand-accent)"/>
  <circle cx="32" cy="29" r="12.5" fill="#fff6e6"/>
  <path d="M19.5 26c0-7 5.6-13 12.5-13s12.5 6 12.5 13c-3-2-7-3-12.5-3s-9.5 1-12.5 3Z" fill="var(--brand-primary)"/>
  <circle cx="27" cy="30" r="1.6" fill="#2b1b1f"/>
  <circle cx="37" cy="30" r="1.6" fill="#2b1b1f"/>
  <path d="M27.5 36c1.6 1.4 7.4 1.4 9 0" stroke="#a35b3d" stroke-width="1.6" fill="none" stroke-linecap="round"/>
</svg>`;

export function initZeeWidget() {
  if (document.getElementById("zee-root")) return;

  const root = document.createElement("div");
  root.id = "zee-root";
  root.innerHTML = `
    <button id="zee-launcher" class="zee-launcher" title="Ask Zee about this page" aria-label="Open Zee chat assistant">
      <span class="zee-avatar">${AVATAR_SVG}</span>
      <span class="zee-status-dot"></span>
    </button>
    <div id="zee-panel" class="zee-panel" style="display:none">
      <div class="zee-panel-header">
        <span class="zee-avatar zee-avatar-small">${AVATAR_SVG}</span>
        <div class="zee-panel-title">
          <div class="zee-panel-name">Zee</div>
          <div class="zee-panel-sub">Ask about what's on this page</div>
        </div>
        <button id="zee-close" class="zee-close" aria-label="Close">×</button>
      </div>
      <div id="zee-messages" class="zee-messages"></div>
      <form id="zee-form" class="zee-form">
        <input id="zee-input" type="text" placeholder="Ask about this page's numbers…" autocomplete="off">
        <button type="submit" class="zee-send">Send</button>
      </form>
    </div>
  `;
  root.style.display = "none"; // hidden until showZeeWidget() — no point showing it on the login screen
  document.body.appendChild(root);

  const launcher = document.getElementById("zee-launcher");
  const panel = document.getElementById("zee-panel");
  const closeBtn = document.getElementById("zee-close");
  const form = document.getElementById("zee-form");
  const input = document.getElementById("zee-input");

  function openPanel() {
    panel.style.display = "flex";
    launcher.classList.add("zee-launcher-open");
    if (!document.getElementById("zee-messages").childElementCount) {
      addMessage("bot", `Hi, I'm Zee! Ask me anything about the "${currentPageLabel || "current"}" page — I can only see what's on screen here.`);
    }
    input.focus();
  }
  function closePanel() {
    panel.style.display = "none";
    launcher.classList.remove("zee-launcher-open");
  }

  launcher.addEventListener("click", () => {
    if (panel.style.display === "none") openPanel();
    else closePanel();
  });
  closeBtn.addEventListener("click", closePanel);

  form.addEventListener("submit", (evt) => {
    evt.preventDefault();
    const question = input.value.trim();
    if (!question) return;
    input.value = "";
    sendQuestion(question);
  });
}

export function showZeeWidget() {
  const root = document.getElementById("zee-root");
  if (root) root.style.display = "block";
}

export function hideZeeWidget() {
  const root = document.getElementById("zee-root");
  if (root) root.style.display = "none";
}
