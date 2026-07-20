# Patch สำหรับ Search Bill

## 1. เพิ่มปุ่มยกเลิกบิลใน HTML Dialog

เพิ่มปุ่มนี้ใน `phase-9-2-bill-search.html` ใกล้ปุ่มคืนสินค้า:

```html
<button
  class="danger-button"
  data-permission="pos.void_bill"
  id="voidButton"
  type="button">
  ยกเลิกบิล
</button>
```

## 2. เพิ่ม Element ใน JavaScript

ใน `const els = { ... }` เพิ่ม:

```javascript
voidButton: document.querySelector('#voidButton'),
```

## 3. เพิ่ม Event Listener

ก่อน `applyPermissionUI(...)` เพิ่ม:

```javascript
els.voidButton.addEventListener('click', () => {
  if (!state.selectedBill) return;

  const saleId = state.selectedBill.id;
  const saleNo = state.selectedBill.sale_no || '';

  const url =
    `./phase-9-2-void-bill.html?sale_id=${encodeURIComponent(saleId)}`
    + `&sale_no=${encodeURIComponent(saleNo)}`;

  window.open(
    url,
    '_blank',
    'width=620,height=640,noopener,noreferrer'
  );
});

window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;

  if (event.data?.type === 'TKN_BILL_VOIDED') {
    els.billDialog.close();
    searchBills();
  }
});
```
