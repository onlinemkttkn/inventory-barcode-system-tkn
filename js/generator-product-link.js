(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  const productId = params.get('product');
  if (!productId) return;

  const linkedName = params.get('name') || 'สินค้า';
  const linkedCode = params.get('code') || '-';

  async function selectLinkedProduct() {
    const status = document.getElementById('selectedProductText');
    const searchInput = document.getElementById('searchInput');
    const message = document.getElementById('searchMessage');

    if (status) status.textContent = `${linkedName} • รหัสสินค้า ${linkedCode} • กำลังโหลดข้อมูล`;

    const { data, error } = await supabaseClient
      .from('product_management_list')
      .select('id,product_code,barcode,name,selling_price,quantity:total_branch_quantity,category_code,category_name,unit_name,is_active')
      .eq('id', productId)
      .maybeSingle();

    if (error || !data) {
      if (status) status.textContent = `${linkedName} • รหัสสินค้า ${linkedCode}`;
      if (message) {
        message.textContent = error
          ? `โหลดสินค้าที่เลือกไม่สำเร็จ: ${error.message}`
          : 'ไม่พบสินค้าที่เลือก กรุณาค้นหาอีกครั้ง';
        message.className = 'message error';
      }
      return;
    }

    selectedProduct = data;
    if (searchInput) searchInput.value = data.name || data.product_code || '';
    if (status) {
      status.textContent = `${data.name || '-'} • รหัสสินค้า ${data.product_code || '-'} • ${data.barcode || 'ไม่มีบาร์โค้ด'}`;
    }
    generate();
  }

  async function startWhenSignedIn() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      await selectLinkedProduct();
      return;
    }

    const { data: listener } = supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
      if (!nextSession) return;
      listener.subscription.unsubscribe();
      setTimeout(selectLinkedProduct, 0);
    });
  }

  startWhenSignedIn();
})();
