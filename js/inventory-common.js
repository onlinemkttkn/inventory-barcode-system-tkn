function showMessage(element, text, type = "") {
  element.textContent = text;
  element.className = `message ${type}`.trim();
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("th-TH", {
    maximumFractionDigits: 3
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

async function requireActiveSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (!session) {
    window.location.href = "./dashboard.html";
    return null;
  }

  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("id,email,full_name,role,is_active")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error || !profile || profile.is_active !== true) {
    await supabaseClient.auth.signOut();
    window.location.href = "./dashboard.html";
    return null;
  }

  return { session, profile };
}

async function findProducts(searchText) {
  const q = String(searchText || "").trim();
  if (!q) return [];

  const safe = q.replace(/[%_,()]/g, "");

  const { data, error } = await supabaseClient
    .from("product_list")
    .select(`
      id,
      product_code,
      barcode,
      name,
      quantity,
      unit_name,
      selling_price,
      category_name,
      is_active
    `)
    .or(`name.ilike.%${safe}%,product_code.ilike.%${safe}%,barcode.eq.${safe}`)
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(20);

  if (error) throw error;
  return data || [];
}
