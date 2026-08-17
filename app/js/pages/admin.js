import { getClient } from "../supabase-client.js";

export const meta = { id: "admin", label: "Manage Access", subtitle: "Grant or revoke dashboard access for your team" };

// Pulled live from employee_master rather than hardcoded — so uploading a
// real data file with different division names (this app only ever had
// Commercial/Corporate/Operations/Supply Chain in its synthetic data) makes
// the right checkboxes appear here with no code change. Paginated the same
// way data.js's fetchAllRows is, since PostgREST caps a single SELECT at
// 1000 rows and employee_master has more than that.
async function fetchDivisions(client) {
  const seen = new Set();
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await client.from("employee_master").select("division").range(from, from + pageSize - 1);
    if (error) throw error;
    data.forEach((r) => { if (r.division) seen.add(r.division); });
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return Array.from(seen).sort();
}

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

    // Degrades to no division columns rather than failing the whole page —
    // a section-restricted admin (no full_access) might not have RLS
    // visibility into employee_master at all, and that shouldn't block
    // Manage Access's core section-assignment job.
    let divisions = [];
    try {
      divisions = await fetchDivisions(client);
    } catch (e) {
      console.warn("Could not load divisions for Manage Access:", e);
    }

    renderTable(data, myUserId, divisions);
  }

  function renderTable(rows, myUserId, divisions) {
    const table = document.createElement("table");
    table.className = "data-table admin-table";
    table.innerHTML = `<thead><tr>
      <th>Email</th>
      <th>Admin</th>
      <th>Full Access</th>
      ${sectionList.map((s) => `<th>${s.label}</th>`).join("")}
      ${divisions.map((d) => `<th>Div: ${d}</th>`).join("")}
    </tr></thead>`;

    const tbody = document.createElement("tbody");
    rows.forEach((row) => {
      const isMe = row.user_id === myUserId;
      const sections = new Set(row.sections || []);
      const rowDivisions = new Set(row.divisions || []);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.email || row.user_id}</td>
        <td><input type="checkbox" data-field="is_admin" ${row.is_admin ? "checked" : ""} ${isMe ? "disabled" : ""} title="${isMe ? "You can't remove your own admin access here" : ""}"></td>
        <td><input type="checkbox" data-field="full_access" ${row.full_access ? "checked" : ""}></td>
        ${sectionList.map((s) => `<td><input type="checkbox" data-section="${s.id}" ${sections.has(s.id) ? "checked" : ""} ${row.full_access ? "disabled" : ""}></td>`).join("")}
        ${divisions.map((d) => `<td><input type="checkbox" data-division="${d}" ${rowDivisions.has(d) ? "checked" : ""} ${row.full_access ? "disabled" : ""} title="Leave all divisions unchecked for unrestricted (within their granted sections)"></td>`).join("")}
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
