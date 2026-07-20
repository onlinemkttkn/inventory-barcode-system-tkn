# แก้ปุ่มพิมพ์ใบเสร็จซ้ำใน js/phase-9-2-bill-search.js

ค้นหา event listener เดิมของ `reprintButton` แล้วเปลี่ยนเป็น:

```javascript
els.reprintButton.addEventListener('click', () => {
  if (!state.selectedBill) return;

  const url =
    `./phase-9-2-reprint-receipt.html?sale_id=`
    + encodeURIComponent(state.selectedBill.id);

  window.open(
    url,
    '_blank',
    'width=520,height=760,noopener'
  );
});
```

ไม่ใช้ `window.print()` จากหน้า Search Bill โดยตรงแล้ว
