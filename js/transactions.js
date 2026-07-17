const el = {
  typeFilter: document.getElementById("typeFilter"),
  searchInput: document.getElementById("searchInput"),
  refreshBtn: document.getElementById("refreshBtn"),
  tableBody: document.getElementById("tableBody"),
  message: document.getElementById("message")
};

let rows = [];

async function loadTransactions() {
  showMessage(el.message, "กำลังโหลดข้อมูล...");

  const { data, error } = await supabaseClient
    .from("inventory_transaction_list")
    .select("*")
    .in("document_type", ["RECEIVE", "ISSUE"])
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    showMessage(el.message, error.message, "error");
    return;
  }

  rows = data || [];
  renderRows();
  showMessage(el.message, `พบ ${rows.length} เอกสาร`);
}

function renderRows() {
  const q = el.searchInput.value.trim().toLowerCase();
  const type = el.typeFilter.value;

  const filtered = rows.filter((row) => {
    if (type && row.document_type !== type) return false;

    const text = [
      row.document_no,
      row.reference_no,
      row.supplier_name,
      row.requester_name,
      row.department,
      row.created_by_name,
      row.created_by_email
    ].join(" ").toLowerCase();

    return !q || text.includes(q);
  });

  el.tableBody.innerHTML = "";

  filtered.forEach((row) => {
    const tr = document.createElement("tr");
    const isReceive = row.document_type === "RECEIVE";
    const party = isReceive
      ? (row.supplier_name || "-")
      : [row.requester_name, row.department].filter(Boolean).join(" / ") || "-";

    tr.innerHTML = `
      <td>${new Date(row.created_at).toLocaleString("th-TH")}</td>
      <td>${escapeHtml(row.document_no)}</td>
      <td><span class="badge ${isReceive ? "receive" : "issue"}">${isReceive ? "รับเข้า" : "เบิก/จ่าย"}</span></td>
      <td>${escapeHtml(row.reference_no || "-")}</td>
      <td>${escapeHtml(party)}</td>
      <td>${formatNumber(row.total_lines)}</td>
      <td>${formatNumber(row.total_quantity)}</td>
      <td>${escapeHtml(row.created_by_name || row.created_by_email || "-")}</td>`;
    el.tableBody.appendChild(tr);
  });
}

el.refreshBtn.addEventListener("click", loadTransactions);
el.typeFilter.addEventListener("change", renderRows);
el.searchInput.addEventListener("input", renderRows);

requireActiveSession().then((user) => {
  if (user) loadTransactions();
});
