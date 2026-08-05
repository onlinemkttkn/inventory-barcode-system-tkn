(() => {
  'use strict';

  const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  document.body.dataset.tknPage = page;
  const inventoryPages = new Set([
    'products-admin.html','categories-admin.html','product-stock-admin.html','print-labels.html',
    'inventory-operations.html','receive.html','issue.html','transfer-create.html','transfer-receive.html',
    'transfer-history.html','transactions.html','stock-count.html','stock-count-history.html','stock-alerts.html',
    'suppliers.html','purchase-order-create.html','purchase-order-history.html','import-export.html',
    'shopee-import.html','lazada-import.html','manual-product-import.html'
  ]);
  if (inventoryPages.has(page)) document.body.classList.add('tkn-ui-inventory-page');

  const ICONS = Object.freeze({
    search:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
    receive:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="M12 3v10M8 9l4 4 4-4"/></svg>',
    issue:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="M12 21V11M8 15l4-4 4 4"/></svg>',
    box:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 7 8-4 8 4-8 4zM4 7v10l8 4 8-4V7M12 11v10"/></svg>',
    scan:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/><path d="M8 8h3v3H8zM13 8h3v3h-3zM8 13h3v3H8zM13 13h1v1h-1zM16 13h1v3h-3v-1"/></svg>',
    camera:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5 10 3h4l1.5 2H19a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z"/><circle cx="12" cy="12.5" r="4"/></svg>',
    product:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h10l4 4v12H5z"/><path d="M15 4v5h5M8 13h8M8 17h6"/></svg>',
    category:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
    stock:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 9 9-5 9 5v11H3z"/><path d="M7 12h10v8H7zM10 12v8M14 12v8"/></svg>',
    transfer:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h13M14 5l3 3-3 3M20 16H7M10 13l-3 3 3 3"/></svg>',
    history:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/><path d="M4 4v4.6h4.6M12 8v5l3 2"/></svg>',
    count:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v3H7zM5 5h14v16H5z"/><path d="m8 13 2 2 5-5M8 18h8"/></svg>',
    edit:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z"/><path d="m14 7 3 3"/></svg>',
    details:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></svg>',
    print:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V3h10v5M6 17H4V9h16v8h-2"/><path d="M7 14h10v7H7zM17 11h.01"/></svg>',
    upload:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21V9M8 13l4-4 4 4"/><path d="M4 5v3h16V5"/></svg>',
    download:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 11l4 4 4-4"/><path d="M4 19h16"/></svg>',
    report:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10h4v10zM10 20V4h4v16zM16 20v-7h4v7z"/></svg>',
    dashboard:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5v8a1.5 1.5 0 0 1-1.5 1.5h-5v-6h-5v6h-5A1.5 1.5 0 0 1 3 19.5z"/></svg>',
    clear:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 16M20 4 4 20"/></svg>'
  });

  function icon(name, extra = '') {
    return `<span class="tkn-ui-icon ${extra}" aria-hidden="true">${ICONS[name] || ICONS.details}</span>`;
  }

  function replaceNodeIcon(node, name) {
    if (!node) return;
    node.innerHTML = icon(name);
  }

  function upgradeIcons() {
    if (page === 'mobile-stock-check.html') {
      const modes = [...document.querySelectorAll('.quick-modes .mode-btn')];
      ['search','issue'].forEach((name, index) => replaceNodeIcon(modes[index]?.querySelector('span'), name));
      const camera = document.querySelector('.camera-icon');
      if (camera) camera.innerHTML = icon('camera');
      const empty = document.querySelector('.empty-result>span');
      if (empty) empty.innerHTML = icon('scan');
      const dock = [...document.querySelectorAll('.bottom-nav>a>span,.bottom-nav>button>span')];
      ['scan','receive','box','dashboard'].forEach((name,index)=>replaceNodeIcon(dock[index],name));
    }

    if (page === 'products-admin.html') {
      const summary = [...document.querySelectorAll('.summary-icon')];
      ['product','details','count','clear'].forEach((name,index)=>replaceNodeIcon(summary[index],name));
      const quick = [...document.querySelectorAll('.quick-nav-icon')];
      ['product','category','stock','upload'].forEach((name,index)=>replaceNodeIcon(quick[index],name));
      const barcodeLead = document.querySelector('.barcode-generator-btn>span');
      const addLead = document.querySelector('.add-product-btn>span');
      replaceNodeIcon(barcodeLead,'print');
      replaceNodeIcon(addLead,'product');
    }

    if (page === 'reports.html') {
      const actionIcons = [...document.querySelectorAll('.report-action-icon')];
      replaceNodeIcon(actionIcons[0],'search');
      replaceNodeIcon(actionIcons[1],'dashboard');
    }

    if (page === 'inventory-operations.html') {
      const map = ['receive','issue','transfer','receive','history','count','stock'];
      document.querySelectorAll('.operation-card').forEach((card,index)=>{
        if (card.querySelector('.tkn-ui-operation-icon')) return;
        const holder = document.createElement('span');
        holder.className = 'tkn-ui-operation-icon';
        holder.innerHTML = icon(map[index] || 'stock');
        card.prepend(holder);
      });
    }
  }

  let detailDialog = null;
  function ensureDetailDialog() {
    if (detailDialog) return detailDialog;
    detailDialog = document.createElement('dialog');
    detailDialog.className = 'tkn-ui-detail-dialog';
    detailDialog.innerHTML = `
      <div class="tkn-ui-detail-card">
        <div class="tkn-ui-detail-head">
          <h2>รายละเอียด</h2>
          <button class="tkn-ui-detail-close" type="button" aria-label="ปิด">×</button>
        </div>
        <div class="tkn-ui-detail-body"><dl class="tkn-ui-detail-list"></dl></div>
        <div class="tkn-ui-detail-foot"><button type="button">ปิดหน้าต่าง</button></div>
      </div>`;
    document.body.appendChild(detailDialog);
    const close = () => detailDialog.open && detailDialog.close();
    detailDialog.querySelector('.tkn-ui-detail-close').addEventListener('click', close);
    detailDialog.querySelector('.tkn-ui-detail-foot button').addEventListener('click', close);
    detailDialog.addEventListener('click', event => {
      const rect = detailDialog.getBoundingClientRect();
      const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
      if (outside) close();
    });
    return detailDialog;
  }

  function cleanText(node) {
    if (!node) return '-';
    const clone = node.cloneNode(true);
    clone.querySelectorAll('button,a,script,style').forEach(el => el.remove());
    return clone.textContent.replace(/\s+/g,' ').trim() || '-';
  }

  function showRowDetails(table, row, title = 'รายละเอียดรายการ') {
    const dialog = ensureDetailDialog();
    const headers = [...table.querySelectorAll('thead th')].map(th => th.textContent.replace(/\s+/g,' ').trim());
    const cells = [...row.cells];
    const items = cells.map((cell,index)=>({
      label: headers[index] || cell.dataset.label || `ข้อมูล ${index + 1}`,
      value: cleanText(cell)
    })).filter(item => item.value !== '-' || item.label);
    dialog.querySelector('h2').textContent = title;
    dialog.querySelector('.tkn-ui-detail-list').innerHTML = items.map(item => `
      <div class="tkn-ui-detail-item"><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}</dd></div>`).join('');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open','');
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  }

  const tableConfigs = {
    'sales-history.html': { selector: 'section.card.wrap table', primary:[0,1,6], action:9, addButton:true, title:'รายละเอียดการขาย' },
    'products-admin.html': { selector: '.product-list-card table', primary:[0,1,5], action:7, addButton:true, cardOnly:true, title:'รายละเอียดสินค้า' },
    'import-export.html': { selector: 'section.card.wrap table', primary:[0,1,2,8], action:9, addButton:true, title:'รายละเอียดรายการนำเข้า' },
    'phase-9-2-bill-search.html': { selector: '.table-wrap table', primary:[0,1,5], action:7, addButton:false, title:'รายละเอียดบิล' },
    'reports.html': { selector: '.report-list-card table', primary:[0,1,3], action:5, addButton:false, title:'รายละเอียดรายงาน' },
    'transactions.html': { selector: '.ledger-table', primary:[0,2,4,7], action:9, addButton:true, title:'รายละเอียดสินค้าเคลื่อนไหว' },
    'product-stock-admin.html': { selector: 'section.card.wrap table', primary:[0,1,2], action:7, addButton:true, title:'รายละเอียดสต็อกสินค้า' },
    'transfer-history.html': { selector: 'section.card.wrap table', primary:[0,2,3], action:6, addButton:true, title:'รายละเอียดการโอน' },
    'stock-count-history.html': { selector: 'section.card.wrap table', primary:[0,1,2], action:6, addButton:true, title:'รายละเอียดการตรวจนับ' },
    'purchase-order-history.html': { selector: 'section.card.wrap table', primary:[0,1,7], action:8, addButton:true, title:'รายละเอียดใบสั่งซื้อ' }
  };

  function enhanceTable(config) {
    const table = document.querySelector(config.selector);
    if (!table) return;
    if (!config.cardOnly) table.classList.add('tkn-mobile-detail-table');
    const headers = [...table.querySelectorAll('thead th')].map(th => th.textContent.replace(/\s+/g,' ').trim());
    const tbody = table.tBodies[0];
    if (!tbody) return;

    const decorate = row => {
      if (!(row instanceof HTMLTableRowElement) || row.dataset.tknUiReady === '1') return;
      const cells = [...row.cells];
      if (!cells.length || cells.some(cell => Number(cell.colSpan) > 1)) return;
      row.dataset.tknUiReady = '1';
      cells.forEach((cell,index)=>{
        cell.dataset.label ||= headers[index] || `ข้อมูล ${index + 1}`;
        if (config.primary.includes(index)) cell.classList.add(index === config.primary[0] ? 'tkn-mobile-primary' : 'tkn-mobile-secondary');
      });
      const actionCell = cells[Math.min(config.action,cells.length - 1)];
      if (actionCell) actionCell.classList.add('tkn-mobile-action');
      if (config.addButton && actionCell && !actionCell.querySelector('.tkn-ui-detail-btn')) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tkn-ui-detail-btn';
        button.innerHTML = `${icon('details')}<span>ดูรายละเอียด</span>`;
        button.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          showRowDetails(table,row,config.title);
        });
        actionCell.prepend(button);
      }
    };

    [...tbody.rows].forEach(decorate);
    new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => {
        if (node instanceof HTMLTableRowElement) decorate(node);
        else if (node instanceof HTMLElement) node.querySelectorAll('tr').forEach(decorate);
      }));
    }).observe(tbody,{childList:true,subtree:true});
  }

  function compactBoxQr() {
    if (page !== 'box-qr-stock.html') return;
    document.querySelectorAll('.tabs button').forEach(button=>{
      button.setAttribute('title',button.textContent.trim());
    });
    const receiveBtn = document.getElementById('receiveBtn');
    if (receiveBtn) receiveBtn.innerHTML = `${icon('receive')}<span>ยืนยันตรวจรับ</span>`;
    const addBox = document.getElementById('addBoxItemBtn');
    if (addBox) addBox.innerHTML = `${icon('box')}<span>เพิ่มเข้ากล่อง</span>`;
    const closeBox = document.getElementById('closeBoxBtn');
    if (closeBox) closeBox.innerHTML = `${icon('box')}<span>ปิดกล่องและสร้าง QR</span>`;
  }

  function improveButtons() {
    const map = [
      ['#refresh','history'],['#searchBtn','search'],['#downloadTemplateBtn','download'],
      ['#validateBtn','details'],['#importBtn','upload'],['#exportBtn','download'],
      ['#load','report'],['#csv','download'],['#print','print']
    ];
    map.forEach(([selector,name])=>{
      const button = document.querySelector(selector);
      if (!button || button.querySelector('.tkn-ui-icon')) return;
      const label = button.textContent.trim();
      button.innerHTML = `${icon(name)}<span>${escapeHtml(label)}</span>`;
      button.style.display = 'inline-flex';
      button.style.alignItems = 'center';
      button.style.justifyContent = 'center';
      button.style.gap = '8px';
    });
  }

  function init() {
    upgradeIcons();
    compactBoxQr();
    improveButtons();
    const config = tableConfigs[page];
    if (config) enhanceTable(config);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
