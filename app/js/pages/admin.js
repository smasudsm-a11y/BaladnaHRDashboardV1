import { getClient } from "../supabase-client.js";

export const meta = { id: "admin", label: "Manage Access", subtitle: "Grant or revoke dashboard access for your team" };

// Fixed, not derived from live data — Manage Access needs a stable
// assignable list independent of this moment's employee_master rows (same
// reasoning RATING_ORDER/SEVERITY_BANDS are hardcoded page constants
// elsewhere). Matches employee_master.division's 4 real values exactly
// (see 24_divisional_access.sql). Empty/no divisions checked = unrestricted
// within whatever sections a user has, same meaning as full_access
// bypassing the section check entirely.
const DIVISIONS = ["Commercial", "Corporate", "Operations", "Supply Chain"];

export function render({ contentEl, sectionList }) {
  contentEl.innerHTML = "";

  const status = document.createElement("div");
  status.className = "admin-status";
  contentEl.appendChild(status);

  const wrap = document.createElement("div");
  wrap.className = "card admin-table-wrap";
  wrap.innerHTML = `<div class="admin-loading">Loading users…</div>`;
  contentEl.appendChild(wrap);

  load();

  async function load() {
    const client = getClient();
    const { data: userData } = await client.auth.getUser();
    const myUserId = userData?.user?.id;

    const { data, error } = await client.from("user_access").select("*").order("email");
    if (error) {
      wrap.innerHTML = `<div class="note-banner"><b>Failed to load users:</b> ${error.message}</div>`;
      return;
    }
    renderTable(data, myUserId);
  }

  function renderTable(rows, myUserId) {
    const table = document.createElement("table");
    table.className = "data-table admin-table";
    table.innerHTML = `<thead><tr>
      <th>Email</th>
      <th>Admin</th>
      <th>Full Access</th>
      ${sectionList.map((s) => `<th>${s.label}</th>`).join("")}
      ${DIVISIONS.map((d) => `<th>Div: ${d}</th>`).join("")}
    </tr></thead>`;

    const tbody = document.createElement("tbody");
    rows.forEach((row) => {
      const isMe = row.user_id === myUserId;
      const sections = new Set(row.sections || []);
      const divisions = new Set(row.divisions || []);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.email || row.user_id}</td>
        <td><input type="checkbox" data-field="is_admin" ${row.is_admin ? "checked" : ""} ${isMe ? "disabled" : ""} title="${isMe ? "You can't remove your own admin access here" : ""}"></td>
        <td><input type="checkbox" data-field="full_access" ${row.full_access ? "checked" : ""}></td>
        ${sectionList.map((s) => `<td><input type="checkbox" data-section="${s.id}" ${sections.has(s.id) ? "checked" : ""} ${row.full_access ? "disabled" : ""}></td>`).join("")}
        ${DIVISIONS.map((d) => `<td><input type="checkbox" data-division="${d}" ${divisions.has(d) ? "checked" : ""} ${row.full_access ? "disabled" : ""} title="Leave all divisions unchecked for unrestricted (within their granted sections)"></td>`).join("")}
      `;
      tbody.appendChild(tr);

      const fullInput = tr.querySelector('input[data-field="full_access"]');
      const sectionInputs = Array.from(tr.querySelectorAll("input[data-section]"));
      const divisionInputs = Array.from(tr.querySelectorAll("input[data-division]"));

      fullInput.addEventListener("change", () => {
        sectionInputs.forEach((inp) => { inp.disabled = fullInput.checked; });
        divisionInputs.forEach((inp) => { inp.disabled = fullInput.checked; });
        saveRow(tr, row);
      });

      tr.querySelectorAll('input[data-field="is_admin"], input[data-section], input[data-division]').forEach((input) => {
        input.addEventListener("change", () => saveRow(tr, row));
      });
    });

    table.appendChild(tbody);
    wrap.innerHTML = "";
    wrap.appendChild(table);
  }

  async function saveRow(tr, row) {
    const client = getClient();
    const isAdminInput = tr.querySelector('input[data-field="is_admin"]');
    const fullInput = tr.querySelector('input[data-field="full_access"]');
    const sectionInputs = Array.from(tr.querySelectorAll("input[data-section]"));
    const divisionInputs = Array.from(tr.querySelectorAll("input[data-division]"));

    const payload = {
      is_admin: isAdminInput.disabled ? row.is_admin : isAdminInput.checked,
      full_access: fullInput.checked,
      sections: sectionInputs.filter((i) => i.checked).map((i) => i.dataset.section),
      divisions: divisionInputs.filter((i) => i.checked).map((i) => i.dataset.division),
    };

    status.textContent = "Saving…";
    const { error } = await client.from("user_access").update(payload).eq("user_id", row.user_id);
    if (error) {
      status.textContent = `Failed to save: ${error.message}`;
    } else {
      Object.assign(row, payload);
      status.textContent = `Saved ${row.email || row.user_id}`;
      setTimeout(() => { if (status.textContent.startsWith("Saved")) status.textContent = ""; }, 2000);
    }
  }
}
