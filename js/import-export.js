const E = {
  dropZone: document.getElementById("dropZone"),
  fileInput: document.getElementById("fileInput"),
  fileName: document.getElementById("fileName"),
  downloadTemplateBtn: document.getElementById("downloadTemplateBtn"),
  validateBtn: document.getElementById("validateBtn"),
  importBtn: document.getElementById("importBtn"),
  exportBtn: document.getElementById("exportBtn"),
  totalRows: document.getElementById("totalRows"),
  validRows: document.getElementById("validRows"),
  invalidRows: document.getElementById("invalidRows"),
  successRows: document.getElementById("successRows"),
  progressBar: document.getElementById("progressBar"),
  previewBody: document.getElementById("previewBody"),
  message: document.getElementById("message"),
};

const REQUIRED_HEADERS = [
  "product_code",
  "product_name",
  "category_code",
  "unit_name",
];

let rawRows = [];
let checkedRows = [];
let currentFileName = "";

function msg(text, cssClass = "") {
  E.message.textContent = text;
  E.message.className = `msg ${cssClass}`.trim();
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadText(filename, text, mime = "text/csv;charset=utf-8") {
  const blob = new Blob(["\uFEFF", text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

function parseCsv(text) {
  const rows = [];
  let current = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      current.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }

      current.push(field);
      field = "";

      if (current.some((value) => String(value).trim() !== "")) {
        rows.push(current);
      }

      current = [];
      continue;
    }

    field += char;
  }

  current.push(field);

  if (current.some((value) => String(value).trim() !== "")) {
    rows.push(current);
  }

  return rows;
}

function normalizeNumber(value, fallback = 0) {
  const cleaned = String(value ?? "")
    .replace(/,/g, "")
    .trim();

  if (!cleaned) return fallback;

  const number = Number(cleaned);
  return Number.isFinite(number) ? number : NaN;
}

async function requireAdmin() {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  if (!session) {
    location.href = "./dashboard.html";
    return null;
  }

  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("role,is_active")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error || !profile || profile.is_active !== true) {
    location.href = "./dashboard.html";
    return null;
  }

  if (profile.role !== "admin") {
    msg("เฉพาะ Admin เท่านั้นที่ Import สินค้าได้", "error");
    E.importBtn.disabled = true;
  }

  return profile;
}

async function readFile(file) {
  currentFileName = file.name;
  E.fileName.textContent = `ไฟล์: ${file.name}`;

  const text = await file.text();
  const matrix = parseCsv(text);

  if (matrix.length < 2) {
    rawRows = [];
    checkedRows = [];
    renderPreview();
    msg("ไฟล์ไม่มีข้อมูลสินค้า", "error");
    return;
  }

  const headers = matrix[0].map((header) =>
    String(header).trim().toLowerCase()
  );

  const missing = REQUIRED_HEADERS.filter(
    (header) => !headers.includes(header)
  );

  if (missing.length) {
    rawRows = [];
    checkedRows = [];
    renderPreview();
    msg(`ขาดหัวคอลัมน์: ${missing.join(", ")}`, "error");
    return;
  }

  rawRows = matrix.slice(1).map((values, index) => {
    const row = { _rowNumber: index + 2 };

    headers.forEach((header, position) => {
      row[header] = String(values[position] ?? "").trim();
    });

    return row;
  });

  checkedRows = [];
  E.totalRows.textContent = rawRows.length.toLocaleString("th-TH");
  E.validRows.textContent = "0";
  E.invalidRows.textContent = "0";
  E.successRows.textContent = "0";
  E.progressBar.style.width = "0%";
  E.importBtn.disabled = true;

  renderRawPreview();
  msg("อ่านไฟล์แล้ว กรุณากดตรวจสอบข้อมูล");
}

function renderRawPreview() {
  E.previewBody.innerHTML = "";

  rawRows.slice(0, 500).forEach((row) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${row._rowNumber}</td>
      <td>${esc(row.product_code)}</td>
      <td>${esc(row.product_name)}</td>
      <td>${esc(row.barcode || "-")}</td>
      <td>${esc(row.category_code)}</td>
      <td>${esc(row.unit_name)}</td>
      <td>${esc(row.initial_branch_code || "-")}</td>
      <td>${esc(row.initial_quantity || "0")}</td>
      <td><span class="badge">ยังไม่ตรวจสอบ</span></td>
      <td>-</td>
    `;

    E.previewBody.appendChild(tr);
  });
}

async function validateRows() {
  if (!rawRows.length) {
    msg("กรุณาเลือกไฟล์ CSV ก่อน", "error");
    return;
  }

  msg("กำลังตรวจสอบข้อมูล...");

  const [
    categoriesResult,
    unitsResult,
    brandsResult,
    branchesResult,
    productsResult,
  ] = await Promise.all([
    supabaseClient.from("categories").select("code"),
    supabaseClient.from("units").select("name"),
    supabaseClient.from("brands").select("code"),
    supabaseClient.from("branches").select("code"),
    supabaseClient.from("products").select("product_code,barcode"),
  ]);

  const error = [
    categoriesResult.error,
    unitsResult.error,
    brandsResult.error,
    branchesResult.error,
    productsResult.error,
  ].find(Boolean);

  if (error) {
    msg(error.message, "error");
    return;
  }

  const categoryCodes = new Set(
    (categoriesResult.data || []).map((item) =>
      String(item.code).toUpperCase()
    )
  );

  const unitNames = new Set(
    (unitsResult.data || []).map((item) =>
      String(item.name).toLowerCase()
    )
  );

  const brandCodes = new Set(
    (brandsResult.data || []).map((item) =>
      String(item.code).toUpperCase()
    )
  );

  const branchCodes = new Set(
    (branchesResult.data || []).map((item) =>
      String(item.code).toUpperCase()
    )
  );

  const existingProductCodes = new Set(
    (productsResult.data || []).map((item) =>
      String(item.product_code).toUpperCase()
    )
  );

  const existingBarcodes = new Set(
    (productsResult.data || [])
      .filter((item) => item.barcode)
      .map((item) => String(item.barcode))
  );

  const fileProductCodes = new Set();
  const fileBarcodes = new Set();

  checkedRows = rawRows.map((row) => {
    const errors = [];

    const productCode = String(row.product_code || "").trim();
    const productName = String(row.product_name || "").trim();
    const categoryCode = String(row.category_code || "")
      .trim()
      .toUpperCase();
    const unitName = String(row.unit_name || "")
      .trim()
      .toLowerCase();
    const brandCode = String(row.brand_code || "")
      .trim()
      .toUpperCase();
    const branchCode = String(row.initial_branch_code || "")
      .trim()
      .toUpperCase();
    const barcode = String(row.barcode || "").trim();

    const costPrice = normalizeNumber(row.cost_price, 0);
    const sellingPrice = normalizeNumber(row.selling_price, 0);
    const minimumStock = normalizeNumber(row.minimum_stock, 0);
    const vatRate = normalizeNumber(row.vat_rate, 0);
    const initialQuantity = normalizeNumber(row.initial_quantity, 0);

    if (!productCode) errors.push("ไม่มีรหัสสินค้า");
    if (!productName) errors.push("ไม่มีชื่อสินค้า");
    if (!categoryCode) errors.push("ไม่มีรหัสหมวดหมู่");
    if (!unitName) errors.push("ไม่มีหน่วยนับ");

    if (
      productCode &&
      (existingProductCodes.has(productCode.toUpperCase()) ||
        fileProductCodes.has(productCode.toUpperCase()))
    ) {
      errors.push("รหัสสินค้าซ้ำ");
    }

    if (
      barcode &&
      (existingBarcodes.has(barcode) || fileBarcodes.has(barcode))
    ) {
      errors.push("บาร์โค้ดซ้ำ");
    }

    if (categoryCode && !categoryCodes.has(categoryCode)) {
      errors.push("ไม่พบหมวดหมู่");
    }

    if (unitName && !unitNames.has(unitName)) {
      errors.push("ไม่พบหน่วยนับ");
    }

    if (brandCode && !brandCodes.has(brandCode)) {
      errors.push("ไม่พบยี่ห้อ");
    }

    if (branchCode && !branchCodes.has(branchCode)) {
      errors.push("ไม่พบสาขา");
    }

    [
      ["ราคาทุน", costPrice],
      ["ราคาขาย", sellingPrice],
      ["ขั้นต่ำ", minimumStock],
      ["VAT", vatRate],
      ["จำนวนเริ่มต้น", initialQuantity],
    ].forEach(([label, value]) => {
      if (!Number.isFinite(value) || value < 0) {
        errors.push(`${label}ไม่ถูกต้อง`);
      }
    });

    if (vatRate > 100) {
      errors.push("VAT เกิน 100%");
    }

    if (productCode) {
      fileProductCodes.add(productCode.toUpperCase());
    }

    if (barcode) {
      fileBarcodes.add(barcode);
    }

    return {
      ...row,
      product_code: productCode,
      product_name: productName,
      category_code: categoryCode,
      unit_name: row.unit_name.trim(),
      brand_code: brandCode,
      initial_branch_code: branchCode,
      barcode,
      cost_price: costPrice,
      selling_price: sellingPrice,
      minimum_stock: minimumStock,
      vat_rate: vatRate,
      initial_quantity: initialQuantity,
      valid: errors.length === 0,
      errors,
      importStatus: "",
      importMessage: "",
    };
  });

  const validCount = checkedRows.filter((row) => row.valid).length;
  const invalidCount = checkedRows.length - validCount;

  E.validRows.textContent = validCount.toLocaleString("th-TH");
  E.invalidRows.textContent = invalidCount.toLocaleString("th-TH");
  E.importBtn.disabled = validCount === 0;

  renderCheckedPreview();

  msg(
    `ตรวจสอบเสร็จ: พร้อมนำเข้า ${validCount} แถว, ผิดพลาด ${invalidCount} แถว`,
    invalidCount ? "error" : "success-text"
  );
}

function renderCheckedPreview() {
  E.previewBody.innerHTML = "";

  checkedRows.slice(0, 500).forEach((row) => {
    const status = row.importStatus
      ? row.importStatus === "SUCCESS"
        ? ["สำเร็จ", "ok"]
        : ["ล้มเหลว", "error-badge"]
      : row.valid
        ? ["พร้อมนำเข้า", "ok"]
        : ["ผิดพลาด", "error-badge"];

    const message = row.importMessage ||
      (row.errors.length ? row.errors.join(", ") : "-");

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${row._rowNumber}</td>
      <td>${esc(row.product_code)}</td>
      <td>${esc(row.product_name)}</td>
      <td>${esc(row.barcode || "-")}</td>
      <td>${esc(row.category_code)}</td>
      <td>${esc(row.unit_name)}</td>
      <td>${esc(row.initial_branch_code || "-")}</td>
      <td>${esc(row.initial_quantity)}</td>
      <td><span class="badge ${status[1]}">${status[0]}</span></td>
      <td>${esc(message)}</td>
    `;

    E.previewBody.appendChild(tr);
  });
}

async function importRows() {
  const validRows = checkedRows.filter((row) => row.valid);

  if (!validRows.length) {
    msg("ไม่มีข้อมูลที่พร้อมนำเข้า", "error");
    return;
  }

  if (
    !confirm(
      `ยืนยัน Import สินค้า ${validRows.length.toLocaleString("th-TH")} รายการ?`
    )
  ) {
    return;
  }

  E.importBtn.disabled = true;
  E.validateBtn.disabled = true;
  E.successRows.textContent = "0";

  let successCount = 0;
  let failedCount = 0;

  for (let index = 0; index < validRows.length; index += 1) {
    const row = validRows[index];

    const { data, error } = await supabaseClient.rpc(
      "import_product_row",
      {
        p_product_code: row.product_code,
        p_name: row.product_name,
        p_barcode: row.barcode || null,
        p_category_code: row.category_code,
        p_unit_name: row.unit_name,
        p_brand_code: row.brand_code || null,
        p_cost_price: row.cost_price,
        p_selling_price: row.selling_price,
        p_minimum_stock: row.minimum_stock,
        p_vat_rate: row.vat_rate,
        p_initial_branch_code: row.initial_branch_code || null,
        p_initial_quantity: row.initial_quantity,
        p_description: row.description || null,
      }
    );

    if (error) {
      row.importStatus = "FAILED";
      row.importMessage = error.message;
      failedCount += 1;
    } else {
      row.importStatus = "SUCCESS";
      row.importMessage = `สร้าง ${data.product_code}`;
      successCount += 1;
    }

    const percent = Math.round(((index + 1) / validRows.length) * 100);
    E.progressBar.style.width = `${percent}%`;
    E.successRows.textContent = successCount.toLocaleString("th-TH");

    if ((index + 1) % 10 === 0 || index === validRows.length - 1) {
      renderCheckedPreview();
    }
  }

  E.validateBtn.disabled = false;

  msg(
    `Import เสร็จ: สำเร็จ ${successCount} รายการ, ล้มเหลว ${failedCount} รายการ`,
    failedCount ? "error" : "success-text"
  );
}

async function exportProducts() {
  msg("กำลัง Export ข้อมูลสินค้า...");

  const { data, error } = await supabaseClient
    .from("product_export_list")
    .select("*")
    .order("product_code");

  if (error) {
    msg(error.message, "error");
    return;
  }

  const headers = [
    "product_code",
    "barcode",
    "product_name",
    "category_code",
    "category_name",
    "unit_name",
    "brand_code",
    "brand_name",
    "cost_price",
    "selling_price",
    "minimum_stock",
    "vat_rate",
    "total_quantity",
    "is_active",
    "description",
    "created_at",
    "updated_at",
  ];

  const csv = [
    headers.join(","),
    ...(data || []).map((row) =>
      headers.map((header) => csvEscape(row[header])).join(",")
    ),
  ].join("\r\n");

  const date = new Date().toISOString().slice(0, 10);
  downloadText(`products-export-${date}.csv`, csv);

  msg(`Export สำเร็จ ${(data || []).length} รายการ`, "success-text");
}

function downloadTemplate() {
  const headers = [
    "product_code",
    "product_name",
    "barcode",
    "category_code",
    "unit_name",
    "brand_code",
    "cost_price",
    "selling_price",
    "minimum_stock",
    "vat_rate",
    "initial_branch_code",
    "initial_quantity",
    "description",
  ];

  const example = [
    "TA0001",
    "เสื้อยืดสีดำ",
    "",
    "TA",
    "ชิ้น",
    "",
    "100",
    "199",
    "5",
    "7",
    "BR001",
    "20",
    "สินค้าตัวอย่าง",
  ];

  downloadText(
    "product-import-template.csv",
    `${headers.join(",")}\r\n${example.map(csvEscape).join(",")}`
  );
}

E.fileInput.addEventListener("change", async () => {
  const file = E.fileInput.files?.[0];
  if (file) await readFile(file);
});

["dragenter", "dragover"].forEach((eventName) => {
  E.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    E.dropZone.classList.add("drag");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  E.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    E.dropZone.classList.remove("drag");
  });
});

E.dropZone.addEventListener("drop", async (event) => {
  const file = event.dataTransfer.files?.[0];
  if (file) await readFile(file);
});

E.downloadTemplateBtn.addEventListener("click", downloadTemplate);
E.validateBtn.addEventListener("click", validateRows);
E.importBtn.addEventListener("click", importRows);
E.exportBtn.addEventListener("click", exportProducts);

requireAdmin();
