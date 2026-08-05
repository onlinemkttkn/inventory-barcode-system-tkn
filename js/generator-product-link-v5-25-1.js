(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const productId = params.get('product');
  if (!productId) return;

  const linkedName = params.get('name') || 'สินค้า';
  const linkedCode = params.get('code') || '-';

  async function loadLinkedProduct() {
    const status = document.getElementById('selectedProductText');
    const searchInput = document.getElementById('searchInput');
    const message = document.getElementById('searchMessage');

    if (status) status.textContent = `${linkedName} • SKU ${linkedCode} • กำลังโหลดข้อมูล`;

    const fields = 'id,product_code,barcode,source_barcode,base_sku,lot_cost_letter,lot_code,name,label_name,product_type_th,model_name,brand_name,cost_price,selling_price,total_branch_quantity,category_code,category_name,unit_name,is_active';
    let result = await supabaseClient
      .from('product_management_list_v5250')
      .select(fields)
      .eq('id', productId)
      .maybeSingle();

    if (result.error) {
      result = await supabaseClient
        .from('product_management_list')
        .select('id,product_code,barcode,name,selling_price,total_branch_quantity,category_code,category_name,unit_name,is_active,cost_price')
        .eq('id', productId)
        .maybeSingle();
    }

    const { data, error } = result;
    if (error || !data) {
      if (status) status.textContent = `${linkedName} • SKU ${linkedCode}`;
      if (message) {
        message.textContent = error
          ? `โหลดสินค้าที่เลือกไม่สำเร็จ: ${error.message}`
          : 'ไม่พบสินค้าที่เลือก กรุณาค้นหาอีกครั้ง';
        message.className = 'message error';
      }
      return;
    }

    selectProduct(data);
    if (searchInput) searchInput.value = data.name || data.product_code || '';
  }

  async function startWhenSignedIn() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) return loadLinkedProduct();

    const { data: listener } = supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
      if (!nextSession) return;
      listener.subscription.unsubscribe();
      setTimeout(loadLinkedProduct, 0);
    });
  }

  startWhenSignedIn();
})();
