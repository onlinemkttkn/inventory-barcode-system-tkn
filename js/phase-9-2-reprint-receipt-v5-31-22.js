import { supabaseClient } from './supabase-client.js';

const COMPANY = { get name(){ return window.TKNBranding?.get?.().company_legal_name || 'บริษัท เถ้าแก่น้อย ชลบุรี จำกัด'; } };
function receiptFooterText(){ return window.TKNBranding?.get?.().receipt_footer || 'ขอบคุณที่ใช้บริการ'; }

function companyReceiptLines(){
  const brand=window.TKNBranding?.get?.()||{};
  const lines=[];
  if(brand.address) lines.push(`<p>${esc(brand.address)}</p>`);
  if(brand.tax_id) lines.push(`<p>เลขประจำตัวผู้เสียภาษี ${esc(brand.tax_id)}</p>`);
  const contact=[brand.phone,brand.email].filter(Boolean).join(' · ');
  if(contact) lines.push(`<p>${esc(contact)}</p>`);
  return lines.join('');
}
async function ensureReceiptBranding(){ try{ await window.TKNBranding?.load?.(); }catch(error){ console.warn('Receipt branding fallback:',error); } }
const params = new URLSearchParams(window.location.search);
const saleId = params.get('sale_id');

const els = {
  receipt: document.querySelector('#receipt'),
  paperSize: document.querySelector('#paperSize'),
  printButton: document.querySelector('#printButton'),
  closeButton: document.querySelector('#closeButton'),
  toolbarStatus: document.querySelector('#toolbarStatus')
};

let header = null;
let items = [];

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[char]);
}
function money(value) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency', currency: 'THB', minimumFractionDigits: 2
  }).format(Number(value || 0));
}
function num(value) {
  return Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 3 });
}
function date(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium', timeStyle: 'short'
  }).format(new Date(value));
}
function payment(value) {
  const labels = {
    CASH: 'เงินสด', QR: 'QR Payment', PROMPTPAY: 'QR Payment',
    TRANSFER: 'เงินโอน', CARD: 'บัตร', VOUCHER: 'Voucher / คูปอง', OTHER: 'ช่องทางอื่น'
  };
  return labels[String(value || '').toUpperCase()] || value || '-';
}
function firstValue(...values) {
  return values.find((value) => value !== null && value !== undefined && String(value).trim() !== '') || '-';
}
function itemGrossTotal(item) {
  return Math.max(Number(item?.quantity || 0) * Number(item?.unit_price || 0), 0);
}
function itemDiscountAmount(item) {
  const stored = Number(item?.discount_amount);
  if (Number.isFinite(stored) && stored >= 0) return Math.min(stored, itemGrossTotal(item));
  const lineTotal = Number(item?.line_total);
  if (Number.isFinite(lineTotal)) return Math.max(itemGrossTotal(item) - lineTotal, 0);
  return 0;
}
function itemNetTotal(item) {
  const stored = Number(item?.line_total);
  if (Number.isFinite(stored) && stored >= 0) return stored;
  return Math.max(itemGrossTotal(item) - itemDiscountAmount(item), 0);
}
function itemDiscountTotal() {
  return items.reduce((sum, item) => sum + itemDiscountAmount(item), 0);
}
function billDiscountAmount() {
  return Math.max(Number(header?.discount_amount || 0), 0);
}
function totalDiscount() {
  return itemDiscountTotal() + billDiscountAmount();
}
function grossSubtotal() {
  if (items.length) return items.reduce((sum, item) => sum + itemGrossTotal(item), 0);
  return Math.max(Number(header?.subtotal || 0) + itemDiscountTotal(), 0);
}
function netTotal() {
  const stored = Number(header?.net_total);
  if (Number.isFinite(stored) && stored >= 0) return stored;
  return Math.max(grossSubtotal() - totalDiscount(), 0);
}
function beforeVatAmount() {
  const stored = Number(header?.vat_base_amount);
  if (Number.isFinite(stored) && stored >= 0) return stored;
  const rate = Math.max(Number(header?.vat_rate || 7), 0);
  return rate > 0 ? netTotal() / (1 + (rate / 100)) : netTotal();
}
function vatAmount() {
  const stored = Number(header?.vat_amount);
  if (Number.isFinite(stored) && stored >= 0) return stored;
  return netTotal() - beforeVatAmount();
}
function vatRate() {
  const rate = Number(header?.vat_rate || 7);
  return Number.isFinite(rate) ? rate : 7;
}
function cashierCode() {
  return firstValue(header?.cashier_employee_code, header?.employee_code, header?.cashier_code);
}
function cashierName() {
  return firstValue(header?.cashier_name, header?.cashier_display_name, header?.cashier_full_name, header?.cashier_email, cashierCode());
}
function branchLabel() {
  return firstValue(header?.branch_name, header?.branch_code, 'สำนักงานใหญ่');
}

async function loadFromViews() {
  const { data: h, error: hErr } = await supabaseClient
    .from('pos_receipt_header')
    .select('*')
    .eq('id', saleId)
    .maybeSingle();
  if (hErr) throw hErr;
  if (!h) throw new Error('ไม่พบข้อมูลบิลย้อนหลัง');

  const { data: i, error: iErr } = await supabaseClient
    .from('pos_receipt_items')
    .select('*')
    .eq('sale_id', saleId)
    .order('id');
  if (iErr) throw iErr;

  const { data: stable, error: stableErr } = await supabaseClient
    .from('sales')
    .select('cashier_shift_id,cashier_user_id,cashier_employee_code,cashier_display_name,vat_rate,vat_included,vat_base_amount,vat_amount')
    .eq('id', saleId)
    .maybeSingle();
  if (stableErr) console.warn('Stable receipt fields unavailable:', stableErr);

  return { header: { ...h, ...(stable || {}) }, items: i || [] };
}

async function loadFromRpc() {
  const { data, error } = await supabaseClient.rpc('get_sale_receipt_phase_9_2', { p_sale_id: saleId });
  if (error) throw error;
  return { header: data?.header || {}, items: data?.items || [] };
}

async function load() {
  if (!saleId) {
    els.toolbarStatus.textContent = 'ไม่พบ sale_id';
    els.receipt.innerHTML = '<p class="receipt-loading">ไม่พบรหัสบิล</p>';
    return;
  }

  try {
    await ensureReceiptBranding();
    let result;
    try {
      result = await loadFromViews();
    } catch (viewError) {
      console.warn('Receipt view load failed; using RPC fallback:', viewError);
      result = await loadFromRpc();
    }
    header = result.header;
    items = result.items;
    await renderReceipt();
    els.printButton.disabled = false;
    els.toolbarStatus.textContent = `พร้อมพิมพ์ ${header.sale_no || ''}`;
  } catch (error) {
    console.error(error);
    els.toolbarStatus.textContent = `โหลดไม่สำเร็จ: ${error.message}`;
    els.receipt.innerHTML = `<p class="receipt-loading">โหลดใบเสร็จไม่สำเร็จ: ${esc(error.message)}</p>`;
  }
}

async function renderReceipt() {
  if (!header) return;
  const paperClass = els.paperSize.value === '58' ? 'receipt-58' : 'receipt-80';
  els.receipt.className = `receipt ${paperClass}`;
  els.receipt.innerHTML = `
    <header class="receipt-company-header">
      <p class="receipt-document-title">ใบเสร็จรับเงิน (สำเนา)</p>
      <h2>${esc(COMPANY.name)}</h2>
      ${companyReceiptLines()}
      <p class="receipt-reprint-mark">REPRINT</p>
    </header>

    <div class="receipt-line"></div>

    <section class="receipt-meta">
      <div><span>เลขที่บิล</span><strong>${esc(header.sale_no || '-')}</strong></div>
      <div><span>วันที่</span><strong>${esc(date(header.created_at))}</strong></div>
      <div><span>สาขา</span><strong>${esc(branchLabel())}</strong></div>
      <div><span>รหัสแคชเชียร์</span><strong>${esc(cashierCode())}</strong></div>
      <div><span>พนักงาน</span><strong>${esc(cashierName())}</strong></div>
      <div><span>ช่องทางชำระ</span><strong>${esc(payment(header.payment_method))}</strong></div>
      ${header.member_no ? `<div><span>สมาชิก</span><strong>${esc(header.member_no)} ${esc(header.member_name || '')}</strong></div>` : ''}
    </section>

    <div class="receipt-line"></div>

    <table class="receipt-table">
      <thead><tr><th>รายการ</th><th class="number-cell">จำนวน</th><th class="number-cell">รวม</th></tr></thead>
      <tbody>
        ${items.map((item) => {
          const discount = itemDiscountAmount(item);
          return `<tr class="${discount > 0 ? 'receipt-item-has-discount' : ''}">
            <td>
              ${esc(item.product_name || item.product_name_snapshot || '-')}
              <br><small>${esc(item.product_code || item.product_code_snapshot || '-')}</small>
              ${discount > 0 ? `<br><small class="receipt-item-discount">ส่วนลด -${money(discount)}</small>` : ''}
            </td>
            <td class="number-cell">${num(item.quantity)}</td>
            <td class="number-cell">${money(itemNetTotal(item))}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>

    <div class="receipt-line"></div>

    <section class="receipt-summary">
      <div><span>ยอดก่อนส่วนลด</span><strong>${money(grossSubtotal())}</strong></div>
      <div class="receipt-discount-total"><span>ส่วนลด</span><strong>-${money(totalDiscount())}</strong></div>
      <div><span>มูลค่าก่อน VAT</span><strong>${money(beforeVatAmount())}</strong></div>
      <div><span>VAT ${esc(vatRate())}%</span><strong>${money(vatAmount())}</strong></div>
      <div class="receipt-net"><span>ยอดสุทธิ (รวม VAT)</span><strong>${money(netTotal())}</strong></div>
      <div><span>รับเงิน</span><strong>${money(header.received_amount)}</strong></div>
      <div><span>เงินทอน</span><strong>${money(header.change_amount)}</strong></div>
    </section>

    <div class="receipt-line"></div>

    <footer class="receipt-footer receipt-center">
      <canvas class="receipt-qr" aria-label="QR เลขที่บิล"></canvas>
      <p class="receipt-thank">${esc(receiptFooterText())}</p>
      <p>กรุณาเก็บใบเสร็จไว้เป็นหลักฐาน</p>
      <p>สามารถเปลี่ยนหรือคืนสินค้า<br>ตามเงื่อนไขของบริษัท</p>
      <p class="receipt-reprint-time">พิมพ์ซ้ำเมื่อ ${esc(date(new Date()))}</p>
      <p class="receipt-powered">${esc(window.TKNBranding?.get?.().app_short_name||'เถ้าแก่น้อย ชลบุรี')} · Final v5.31.22</p>
    </footer>`;

  const canvas = els.receipt.querySelector('.receipt-qr');
  try {
    await window.TKNReceiptQR?.render(canvas, header.sale_no, { width: 90, margin: 1 });
  } catch (error) {
    console.warn('Receipt QR skipped:', error);
    canvas?.remove();
  }
}

function applyReprintPageStyle() {
  const is58 = els.paperSize.value === '58';
  const width = is58 ? 58 : 80;
  if (header) renderReceipt();
  let style = document.getElementById('tknReprintDynamicPage');
  if (!style) {
    style = document.createElement('style');
    style.id = 'tknReprintDynamicPage';
    document.head.appendChild(style);
  }
  style.textContent = `
    @page{size:${width}mm auto;margin:0}
    @media print{
      html,body,.receipt-page{width:${width}mm!important;max-width:${width}mm!important;min-width:${width}mm!important;margin:0!important;padding:0!important}
      .receipt{width:${width}mm!important;max-width:${width}mm!important;margin:0!important;padding:3mm ${is58 ? '3mm' : '4mm'}!important}
    }`;
}

async function waitForPrintReady() {
  try { if (document.fonts?.ready) await document.fonts.ready; } catch (error) { console.warn(error); }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

els.paperSize.addEventListener('change', applyReprintPageStyle);
els.printButton.addEventListener('click', async () => {
  els.printButton.disabled = true;
  try {
    applyReprintPageStyle();
    await waitForPrintReady();
    try {
      await supabaseClient.rpc('log_receipt_reprint_phase_9_2', {
        p_sale_id: saleId,
        p_sale_no: header?.sale_no || null,
        p_paper_size: Number(els.paperSize.value || 80)
      });
    } catch (auditError) {
      console.warn('Reprint audit skipped:', auditError);
    }
    window.print();
  } finally {
    els.printButton.disabled = false;
  }
});
els.closeButton.addEventListener('click', () => {
  if (window.opener) window.close();
  else if (history.length > 1) history.back();
  else location.href = './phase-9-2-bill-search.html';
});

applyReprintPageStyle();
load();
