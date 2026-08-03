(() => {
  'use strict';

  const VERSION = '5.18.0';
  const COMPANY = 'เถ้าแก่น้อย ชลบุรี';
  const currentPage = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const printPages = new Set([
    'receipt.html','phase-9-2-reprint-receipt.html','print-labels.html',
    'generator.html','sales-return-receipt.html','sales-return-receipt-v2-3.html'
  ]);

  const routes = [
    { href:'./dashboard.html', label:'หน้าหลัก', icon:'⌂', key:'dashboard' },
    { href:'./pos.html', label:'ขาย', icon:'▣', key:'pos' },
    { href:'./mobile-stock-check.html', label:'สแกน', icon:'⌗', key:'scan' },
    { href:'./box-qr-stock.html', label:'สต็อก', icon:'▦', key:'stock' }
  ];

  const launcherRoutes = [
    ['./dashboard.html','⌂','Dashboard'],
    ['./pos.html','▣','POS / ขายหน้าร้าน'],
    ['./mobile-stock-check.html','⌗','สแกน QR / ตรวจสต็อก'],
    ['./box-qr-stock.html','▦','Box QR / จัดกล่อง'],
    ['./products-admin.html','◆','จัดการสินค้า'],
    ['./inventory-operations.html','▤','คลังสินค้า'],
    ['./reports.html','▥','รายงาน'],
    ['./import-export.html','⇅','Import / Export'],
    ['./phase-9-2-bill-search.html','⌕','ค้นหาบิลย้อนหลัง'],
    ['./stock-count.html','✓','ตรวจนับสต็อก'],
    ['./users-admin.html','♙','ผู้ใช้และสิทธิ์'],
    ['./audit-log.html','≡','Audit Log']
  ];

  const pageNames = {
    'dashboard.html':'Dashboard','pos.html':'ขายหน้าร้าน','pos-member.html':'สมาชิก',
    'mobile-stock-check.html':'สแกนสต็อก','scanner.html':'สแกน','box-qr-stock.html':'Box QR',
    'products-admin.html':'สินค้า','product-stock-admin.html':'สต็อกสินค้า',
    'inventory-operations.html':'คลังสินค้า','receive.html':'รับสินค้า','issue.html':'เบิกสินค้า',
    'transfer-create.html':'สร้างใบโอน','transfer-receive.html':'รับโอน','transfer-history.html':'ประวัติโอน',
    'reports.html':'รายงาน','phase-9-2-bill-search.html':'ค้นหาบิล','sales-history.html':'ประวัติขาย',
    'import-export.html':'นำเข้า / ส่งออก','shopee-import.html':'Shopee','lazada-import.html':'Lazada',
    'manual-product-import.html':'นำเข้าสินค้า','hardware-settings.html':'ตั้งค่าเครื่องพิมพ์',
    'users-admin.html':'ผู้ใช้','audit-log.html':'Audit Log','stock-count.html':'ตรวจนับสต็อก'
  };

  function isStandalone(){
    return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function byPageKey(){
    if(currentPage === 'dashboard.html' || currentPage === 'index.html') return 'dashboard';
    if(currentPage === 'pos.html' || currentPage === 'pos-member.html') return 'pos';
    if(currentPage.includes('mobile-stock') || currentPage === 'scanner.html') return 'scan';
    if(currentPage.includes('box-qr') || currentPage.includes('stock') || currentPage.includes('inventory')) return 'stock';
    return '';
  }

  function addBodyClasses(){
    document.body.classList.add('tkn-mobile-ready');
    if(isStandalone()) document.body.classList.add('tkn-app-standalone');
    if(printPages.has(currentPage)) document.body.classList.add('tkn-print-page');
  }

  function pageTitle(){
    if(pageNames[currentPage]) return pageNames[currentPage];
    const h1 = [...document.querySelectorAll('h1')].find(node => node.textContent?.trim());
    return h1?.textContent?.trim().replace(/\s+/g,' ').slice(0,34) || 'ระบบร้านค้า';
  }

  function safeBack(){
    if(window.TKNSafeBack?.go){ window.TKNSafeBack.go(); return; }
    try{
      const ref = document.referrer ? new URL(document.referrer) : null;
      if(history.length > 1 && ref?.origin === location.origin){ history.back(); return; }
    }catch{}
    location.href = currentPage === 'dashboard.html' ? './dashboard.html' : './dashboard.html';
  }

  function createMobileTopbar(){
    if(printPages.has(currentPage) || document.querySelector('.tkn-mobile-topbar')) return;
    const header = document.createElement('header');
    header.className = 'tkn-mobile-topbar no-print';
    header.innerHTML = `
      <button class="tkn-mobile-back" type="button" aria-label="ย้อนกลับ" title="ย้อนกลับ"><span aria-hidden="true">←</span></button>
      <a class="tkn-mobile-brand" href="./dashboard.html" aria-label="${COMPANY}">
        <img src="./assets/tkn-company-logo.png?v=${VERSION}" alt="${COMPANY}">
        <span class="tkn-mobile-title-copy"><strong>${pageTitle()}</strong><small>Final v${VERSION}</small></span>
      </a>`;
    header.querySelector('.tkn-mobile-back')?.addEventListener('click', safeBack);
    document.body.prepend(header);
  }

  function wrapTables(){
    document.querySelectorAll('table').forEach(table => {
      if(table.closest('.tkn-table-scroll') || table.closest('[data-no-mobile-wrap]')) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'tkn-table-scroll';
      wrapper.setAttribute('role','region');
      wrapper.setAttribute('aria-label','ตารางข้อมูล เลื่อนได้ในแนวนอน');
      table.parentNode?.insertBefore(wrapper,table);
      wrapper.appendChild(table);
    });
  }

  function improveDialogs(){
    document.querySelectorAll('dialog,[role="dialog"],.modal,.popup').forEach(dialog => {
      if(!dialog.hasAttribute('aria-label') && !dialog.hasAttribute('aria-labelledby')){
        const heading = dialog.querySelector('h1,h2,h3,.modal-title,.dialog-title');
        if(heading?.textContent?.trim()) dialog.setAttribute('aria-label',heading.textContent.trim());
      }
    });
  }

  function toast(message,duration=2400){
    let node = document.querySelector('.tkn-app-toast');
    if(!node){
      node = document.createElement('div');
      node.className = 'tkn-app-toast';
      node.setAttribute('role','status');
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add('is-visible');
    clearTimeout(node._tknTimer);
    node._tknTimer = setTimeout(() => node.classList.remove('is-visible'),duration);
  }

  function createLauncher(){
    const launcher = document.createElement('div');
    launcher.className = 'tkn-app-launcher';
    launcher.setAttribute('aria-hidden','true');
    launcher.innerHTML = `
      <section class="tkn-app-launcher-sheet" role="dialog" aria-modal="true" aria-label="เมนูระบบ">
        <div class="tkn-app-launcher-head">
          <div><strong>เมนูงานทั้งหมด</strong><div style="font-size:.76rem;color:#6d6566">${COMPANY} · Final v${VERSION}</div></div>
          <button class="tkn-app-launcher-close" type="button" aria-label="ปิดเมนู">×</button>
        </div><div class="tkn-app-launcher-grid"></div>
      </section>`;
    const grid = launcher.querySelector('.tkn-app-launcher-grid');
    launcherRoutes.forEach(([href,icon,label]) => {
      const link = document.createElement('a');
      link.href = href;
      link.innerHTML = `<span aria-hidden="true">${icon}</span><span>${label}</span>`;
      grid.appendChild(link);
    });
    const close = () => {
      launcher.classList.remove('is-open');
      launcher.setAttribute('aria-hidden','true');
      document.documentElement.style.overflow = '';
    };
    const open = () => {
      launcher.classList.add('is-open');
      launcher.setAttribute('aria-hidden','false');
      document.documentElement.style.overflow = 'hidden';
      launcher.querySelector('.tkn-app-launcher-close')?.focus();
    };
    launcher.querySelector('.tkn-app-launcher-close')?.addEventListener('click',close);
    launcher.addEventListener('click',event => { if(event.target === launcher) close(); });
    document.addEventListener('keydown',event => { if(event.key === 'Escape' && launcher.classList.contains('is-open')) close(); });
    document.body.appendChild(launcher);
    return {open,close};
  }

  function createMobileDock(){
    if(printPages.has(currentPage)) return;
    const {open} = createLauncher();
    const activeKey = byPageKey();
    const dock = document.createElement('nav');
    dock.className = 'tkn-mobile-dock no-print';
    dock.setAttribute('aria-label','เมนูด่วนมือถือ');
    routes.forEach(route => {
      const link = document.createElement('a');
      link.href = route.href;
      link.classList.toggle('active',route.key === activeKey);
      link.innerHTML = `<span class="tkn-dock-icon" aria-hidden="true">${route.icon}</span><span>${route.label}</span>`;
      dock.appendChild(link);
    });
    const more = document.createElement('button');
    more.type = 'button';
    more.innerHTML = '<span class="tkn-dock-icon" aria-hidden="true">☰</span><span>เมนู</span>';
    more.addEventListener('click',open);
    dock.appendChild(more);
    document.body.appendChild(dock);
  }

  function createNetworkStatus(){
    const status = document.createElement('div');
    status.className = 'tkn-network-status';
    status.setAttribute('role','status');
    status.textContent = 'ออฟไลน์ — ข้อมูลสดจะอัปเดตเมื่อเชื่อมต่ออีกครั้ง';
    document.body.appendChild(status);
    const update = () => {
      status.classList.toggle('is-offline',!navigator.onLine);
      if(navigator.onLine && status.dataset.wasOffline === 'true') toast('กลับมาออนไลน์แล้ว');
      status.dataset.wasOffline = String(!navigator.onLine);
    };
    window.addEventListener('online',update);
    window.addEventListener('offline',update);
    update();
  }

  function setupInstallPrompt(){
    if(printPages.has(currentPage) || isStandalone()) return;
    let deferredPrompt = null;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tkn-app-install no-print';
    button.textContent = 'ติดตั้งเป็นแอป';
    button.addEventListener('click',async() => {
      if(!deferredPrompt){ toast('เปิดเมนู Browser แล้วเลือก “เพิ่มไปยังหน้าจอหลัก”'); return; }
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice.catch(() => null);
      if(choice?.outcome === 'accepted') button.classList.remove('is-visible');
      deferredPrompt = null;
    });
    document.body.appendChild(button);
    window.addEventListener('beforeinstallprompt',event => {
      event.preventDefault(); deferredPrompt = event; button.classList.add('is-visible');
    });
    window.addEventListener('appinstalled',() => {
      button.classList.remove('is-visible'); toast(`ติดตั้ง ${COMPANY} แล้ว`);
    });
  }

  function registerServiceWorker(){
    if(!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    window.addEventListener('load',() => {
      navigator.serviceWorker.register('./service-worker-v5.18.0.js',{scope:'./'})
        .catch(error => console.warn('Service worker registration failed:',error));
    });
  }

  function observeDynamicContent(){
    let queued = false;
    const observer = new MutationObserver(() => {
      if(queued) return; queued = true;
      requestAnimationFrame(() => { queued = false; wrapTables(); improveDialogs(); });
    });
    observer.observe(document.body,{childList:true,subtree:true});
  }

  function start(){
    addBodyClasses();
    createMobileTopbar();
    wrapTables();
    improveDialogs();
    createMobileDock();
    createNetworkStatus();
    setupInstallPrompt();
    registerServiceWorker();
    observeDynamicContent();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();

  window.TKNMobileApp = Object.freeze({version:VERSION,toast,safeBack});
})();
