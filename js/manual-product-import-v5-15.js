(() => {
  'use strict';
  const STORAGE_KEY = 'tkn_manual_product_import_v5_15_draft';
  const E = Object.fromEntries([
    'defaultBranch','defaultSupplier','defaultReference','markupPercent','vatRate','vatMode','roundPrice','updateExistingPrice',
    'addRowBtn','clearRowsBtn','pasteArea','pasteRowsBtn','totalCount','newCount','existingCount','readyCount','invalidCount',
    'calculateBtn','validateBtn','saveDraftBtn','selectAll','rowsBody','message','importBtn','previewDialog','previewClose','previewCancel',
    'previewConfirm','previewSummary','previewBody'
  ].map(id => [id, document.getElementById(id)]));

  const state = { rows: [], categories: [], units: [], brands: [], branches: [], products: [], byCode: new Map(), byBarcode: new Map(), refsLoaded: false, busy: false };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const num = (value, fallback = NaN) => { const n = Number(String(value ?? '').replace(/,/g,'').trim()); return Number.isFinite(n) ? n : fallback; };
  const money = value => new Intl.NumberFormat('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value || 0));
  const uid = () => crypto.randomUUID?.() || `manual-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const normalizeCode = value => String(value ?? '').trim().toUpperCase();
  const setMessage = (text, type='') => { E.message.textContent=text||''; E.message.className=`message ${type}`.trim(); };

  function newRow(seed={}) {
    return {
      id: uid(), selected: true, product_code:'', barcode:'', product_name:'', category_code:'', unit_name:'', brand_code:'',
      cost_price:'', quantity:'1', selling_price:'', raw_selling_price:null, condition_status:'NORMAL', notes:'',
      existing:null, errors:[], status:'DRAFT', imported:false, importResult:null, idempotency_key:uid(), ...seed
    };
  }

  function settings() {
    return {
      branchCode: E.defaultBranch.value,
      supplier: E.defaultSupplier.value.trim(),
      reference: E.defaultReference.value.trim(),
      markupPercent: num(E.markupPercent.value,0),
      vatRate: num(E.vatRate.value,0),
      costIncludesVat: E.vatMode.value === 'INCLUDED',
      roundToEndingZero: E.roundPrice.checked,
      updateExistingPrice: E.updateExistingPrice.checked,
    };
  }

  function calculatePrice(cost, cfg=settings()) {
    const vatAmount = cfg.costIncludesVat ? 0 : cost * cfg.vatRate / 100;
    const profitAmount = cost * cfg.markupPercent / 100;
    const raw = cost + vatAmount + profitAmount;
    const hasDecimal = Math.abs(raw - Math.round(raw)) > 0.000001;
    const final = cfg.roundToEndingZero && hasDecimal ? Math.ceil((raw - 0.0000001) / 10) * 10 : raw;
    return { raw:Number(raw.toFixed(2)), final:Number(final.toFixed(2)), vatAmount, profitAmount };
  }

  function options(items, key, label, includeBlank=true) {
    return `${includeBlank?'<option value="">เลือก</option>':''}${items.map(item=>`<option value="${esc(item[key])}">${esc(item[label]||item[key])}</option>`).join('')}`;
  }

  function rowType(row) { return row.existing ? 'EXISTING' : 'NEW'; }
  function statusBadge(row) {
    if (row.imported) return `<span class="row-status ready">บันทึกแล้ว</span><small class="import-result">${esc(row.importResult?.mode || '')} · ทุนเฉลี่ยใหม่ ${money(row.importResult?.new_average_cost || row.cost_price)}${row.importResult?.stock_document_no?` · ${esc(row.importResult.stock_document_no)}`:''}</small>`;
    if (row.errors.length) return `<span class="row-status error">ผิดพลาด ${row.errors.length}</span><small class="import-result">${esc(row.errors.slice(0,3).join(' · '))}</small>`;
    if (row.existing) return `<span class="row-status existing">SKU เดิม / รับเพิ่ม</span><small class="import-result">ทุนเฉลี่ยเดิม ${money(row.existing.cost_price)} · ขาย ${money(row.existing.selling_price)}</small>`;
    return '<span class="row-status new">สินค้าใหม่</span>';
  }

  function renderRows() {
    if (!state.rows.length) state.rows=[newRow()];
    const catOptions=options(state.categories,'code','display');
    const unitOptions=options(state.units,'name','name');
    const brandOptions=options(state.brands,'code','display');
    E.rowsBody.innerHTML=state.rows.map((row,index)=>`<tr data-row-id="${row.id}" class="${row.errors.length?'row-invalid':''}">
      <td><input type="checkbox" data-field="selected" ${row.selected?'checked':''} ${row.imported?'disabled':''}></td><td>${index+1}</td>
      <td><div class="cell-stack"><input data-field="product_code" value="${esc(row.product_code)}" placeholder="SKU/รหัสสินค้า"><input data-field="barcode" value="${esc(row.barcode)}" placeholder="Barcode (สแกนได้)" inputmode="numeric"></div></td>
      <td><div class="cell-stack"><input class="wide" data-field="product_name" value="${esc(row.product_name)}" placeholder="ชื่อสินค้า"><select data-field="category_code">${catOptions}</select><select data-field="unit_name">${unitOptions}</select><select data-field="brand_code">${brandOptions}</select></div></td>
      <td><div class="cell-stack"><input data-field="cost_price" type="number" min="0" step="0.01" value="${esc(row.cost_price)}" placeholder="ต้นทุน"><input data-field="quantity" type="number" min="0" step="0.001" value="${esc(row.quantity)}" placeholder="จำนวน"></div></td>
      <td><div class="cell-stack"><input data-field="selling_price" type="number" min="0" step="0.01" value="${esc(row.selling_price)}" placeholder="ราคาขายร่าง"><small>${row.raw_selling_price!=null?`ก่อนปัด ${money(row.raw_selling_price)}`:'ยังไม่คำนวณ'}</small></div></td>
      <td><div class="cell-stack"><select data-field="condition_status"><option value="NORMAL">ปกติ</option><option value="OPENED">แกะซีล</option><option value="DENTED_BOX">กล่องบุบ</option><option value="DEFECT">มีตำหนิ</option><option value="DAMAGED">ชำรุด</option><option value="INCOMPLETE">อุปกรณ์ไม่ครบ</option><option value="PENDING">รอตรวจสอบ</option></select><input class="wide" data-field="notes" value="${esc(row.notes)}" placeholder="หมายเหตุ"></div></td>
      <td>${statusBadge(row)}</td><td><button class="delete-row" data-delete-row="${row.id}" type="button" ${row.imported?'disabled':''}>ลบ</button></td>
    </tr>`).join('');
    state.rows.forEach(row=>{
      const tr=E.rowsBody.querySelector(`[data-row-id="${CSS.escape(row.id)}"]`);
      ['category_code','unit_name','brand_code','condition_status'].forEach(field=>{const el=tr?.querySelector(`[data-field="${field}"]`);if(el)el.value=row[field]||'';});
    });
    updateSummary();
  }

  function saveDraft(silent=true) {
    try { localStorage.setItem(STORAGE_KEY,JSON.stringify({version:'5.15.0',savedAt:new Date().toISOString(),settings:settings(),rows:state.rows.filter(r=>!r.imported)})); if(!silent)setMessage('บันทึกร่างในเครื่องแล้ว','success'); }
    catch(error){if(!silent)setMessage(`บันทึกร่างไม่สำเร็จ: ${error.message}`,'error');}
  }

  function loadDraft() {
    try {
      const draft=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
      if(!draft?.rows?.length)return false;
      state.rows=draft.rows.map(row=>newRow(row));
      const s=draft.settings||{};
      E.defaultSupplier.value=s.supplier||'';E.defaultReference.value=s.reference||'';E.markupPercent.value=s.markupPercent??30;E.vatRate.value=s.vatRate??7;E.vatMode.value=s.costIncludesVat?'INCLUDED':'EXCLUDED';E.roundPrice.checked=s.roundToEndingZero!==false;E.updateExistingPrice.checked=s.updateExistingPrice!==false;
      if(s.branchCode)E.defaultBranch.value=s.branchCode;
      return true;
    } catch { return false; }
  }

  async function loadReferences() {
    const [categories,units,brands,branches]=await Promise.all([
      supabaseClient.from('categories').select('code,name').order('name'),
      supabaseClient.from('units').select('name').order('name'),
      supabaseClient.from('brands').select('code,name').eq('is_active',true).order('name'),
      supabaseClient.from('branches').select('code,name').eq('is_active',true).order('sort_order')
    ]);
    const error=[categories.error,units.error,brands.error,branches.error].find(Boolean);if(error)throw error;
    state.categories=(categories.data||[]).map(x=>({...x,display:`${x.code} — ${x.name}`}));state.units=units.data||[];state.brands=(brands.data||[]).map(x=>({...x,display:`${x.code} — ${x.name}`}));state.branches=branches.data||[];
    E.defaultBranch.innerHTML=state.branches.map(x=>`<option value="${esc(x.code)}">${esc(x.code)} — ${esc(x.name)}</option>`).join('');
    state.products=[];const size=1000;
    for(let from=0;;from+=size){const r=await supabaseClient.from('products').select('id,product_code,name,barcode,cost_price,selling_price,vat_rate,is_active').range(from,from+size-1);if(r.error)throw r.error;const batch=r.data||[];state.products.push(...batch);if(batch.length<size)break;}
    state.byCode=new Map(state.products.map(p=>[normalizeCode(p.product_code),p]));state.byBarcode=new Map(state.products.filter(p=>p.barcode).map(p=>[String(p.barcode),p]));state.refsLoaded=true;
  }

  function validateRows() {
    const seenCode=new Set(),seenBarcode=new Set();const cfg=settings();
    state.rows.forEach(row=>{
      row.errors=[];row.existing=state.byCode.get(normalizeCode(row.product_code))||state.byBarcode.get(String(row.barcode||'').trim())||null;
      const code=normalizeCode(row.product_code),barcode=String(row.barcode||'').trim(),cost=num(row.cost_price),qty=num(row.quantity),selling=num(row.selling_price);
      if(!code)row.errors.push('ไม่มี SKU');if(!String(row.product_name||'').trim()&&!row.existing)row.errors.push('ไม่มีชื่อสินค้า');
      if(seenCode.has(code)&&code)row.errors.push('SKU ซ้ำในรายการ');else if(code)seenCode.add(code);
      if(barcode&&seenBarcode.has(barcode))row.errors.push('Barcode ซ้ำในรายการ');else if(barcode)seenBarcode.add(barcode);
      if(!row.existing&&!row.category_code)row.errors.push('ยังไม่เลือกหมวด');if(!row.existing&&!row.unit_name)row.errors.push('ยังไม่เลือกหน่วย');
      if(!Number.isFinite(cost)||cost<0)row.errors.push('ต้นทุนไม่ถูกต้อง');if(!Number.isFinite(qty)||qty<0)row.errors.push('จำนวนไม่ถูกต้อง');if(!Number.isFinite(selling)||selling<0)row.errors.push('ราคาขายไม่ถูกต้อง');
      const vatBase=Number.isFinite(cost)?(cfg.costIncludesVat?cost:cost*(1+cfg.vatRate/100)):0;if(Number.isFinite(selling)&&selling+0.0001<vatBase)row.errors.push('ราคาขายต่ำกว่าทุนรวม VAT');
      if(row.imported)row.errors=[];
    });
    renderRows();setMessage(`ตรวจสอบแล้ว: พร้อม ${state.rows.filter(r=>r.selected&&!r.errors.length&&!r.imported).length} รายการ`,'success');
  }

  function updateSummary(){const active=state.rows.filter(r=>!r.imported);E.totalCount.textContent=active.length.toLocaleString('th-TH');E.newCount.textContent=active.filter(r=>!r.existing).length.toLocaleString('th-TH');E.existingCount.textContent=active.filter(r=>r.existing).length.toLocaleString('th-TH');const ready=active.filter(r=>r.selected&&!r.errors.length);E.readyCount.textContent=ready.length.toLocaleString('th-TH');E.invalidCount.textContent=active.filter(r=>r.errors.length).length.toLocaleString('th-TH');E.importBtn.disabled=!ready.length||state.busy;E.selectAll.checked=active.length>0&&active.every(r=>r.selected);E.selectAll.indeterminate=active.some(r=>r.selected)&&!active.every(r=>r.selected);}

  function calculateSelected(){const cfg=settings();if(!Number.isFinite(cfg.markupPercent)||cfg.markupPercent<0||!Number.isFinite(cfg.vatRate)||cfg.vatRate<0)return setMessage('เปอร์เซ็นต์กำไรหรือ VAT ไม่ถูกต้อง','error');let done=0,skip=0;state.rows.filter(r=>r.selected&&!r.imported).forEach(row=>{const cost=num(row.cost_price);if(!Number.isFinite(cost)||cost<=0){skip++;return;}const result=calculatePrice(cost,cfg);row.raw_selling_price=result.raw;row.selling_price=String(result.final);done++;});validateRows();saveDraft();setMessage(`คำนวณราคาขายร่าง ${done} รายการ · ข้าม ${skip} รายการ สามารถแก้ราคาขายเองก่อนยืนยันได้`,'success');}

  function parsePastedRows(){const text=E.pasteArea.value.trim();if(!text)return setMessage('ยังไม่มีข้อมูลที่วาง','error');const lines=text.split(/\r?\n/).filter(Boolean).slice(0,500);for(const line of lines){const c=line.includes('\t')?line.split('\t'):line.split(',');state.rows.push(newRow({product_code:(c[0]||'').trim(),barcode:(c[1]||'').trim(),product_name:(c[2]||'').trim(),category_code:(c[3]||'').trim(),unit_name:(c[4]||'').trim(),brand_code:(c[5]||'').trim(),cost_price:(c[6]||'').trim(),quantity:(c[7]||'1').trim(),condition_status:(c[8]||'NORMAL').trim().toUpperCase(),notes:(c[9]||'').trim()}));}E.pasteArea.value='';validateRows();saveDraft();setMessage(`เพิ่มจากข้อมูลที่วาง ${lines.length} แถวแล้ว`,'success');}

  function previewImport(){validateRows();const rows=state.rows.filter(r=>r.selected&&!r.errors.length&&!r.imported);if(!rows.length)return setMessage('ไม่มีรายการที่พร้อมบันทึก','error');const newRows=rows.filter(r=>!r.existing).length,existingRows=rows.length-newRows,totalQty=rows.reduce((s,r)=>s+num(r.quantity,0),0);E.previewSummary.innerHTML=`<article><span>รายการ</span><strong>${rows.length.toLocaleString('th-TH')}</strong></article><article><span>สินค้าใหม่</span><strong>${newRows.toLocaleString('th-TH')}</strong></article><article><span>SKU เดิม</span><strong>${existingRows.toLocaleString('th-TH')}</strong></article><article><span>จำนวนรวม</span><strong>${totalQty.toLocaleString('th-TH')}</strong></article>`;E.previewBody.innerHTML=rows.map(r=>`<tr><td>${esc(r.product_code)}</td><td>${r.existing?'รับ SKU เดิมเพิ่ม':'สร้างสินค้าใหม่'}</td><td>${esc(r.quantity)}</td><td>${money(r.cost_price)}</td><td>${money(r.selling_price)}</td><td>${esc(r.condition_status)}</td></tr>`).join('');E.previewDialog.showModal();}

  async function confirmImport(){if(state.busy)return;const rows=state.rows.filter(r=>r.selected&&!r.errors.length&&!r.imported);if(!rows.length)return;state.busy=true;E.previewConfirm.disabled=true;E.importBtn.disabled=true;E.previewDialog.close();const cfg=settings();let success=0,failed=0;setMessage(`กำลังบันทึก 0/${rows.length} รายการ...`);
    for(let i=0;i<rows.length;i++){const row=rows[i];try{const {data,error}=await supabaseClient.rpc('manual_import_product_v5_15',{p_product_code:normalizeCode(row.product_code),p_name:String(row.product_name||row.existing?.name||'').trim(),p_barcode:String(row.barcode||'').trim()||null,p_category_code:row.category_code||state.categories[0]?.code||'',p_unit_name:row.unit_name||state.units[0]?.name||'',p_brand_code:row.brand_code||null,p_cost_price:num(row.cost_price,0),p_selling_price:num(row.selling_price,0),p_vat_rate:cfg.vatRate,p_cost_includes_vat:cfg.costIncludesVat,p_markup_percent:cfg.markupPercent,p_raw_selling_price:row.raw_selling_price,p_round_to_ending_zero:cfg.roundToEndingZero,p_branch_code:cfg.branchCode,p_quantity:num(row.quantity,0),p_supplier_name:cfg.supplier||null,p_reference_no:cfg.reference||null,p_condition_status:row.condition_status||'NORMAL',p_notes:row.notes||null,p_update_selling_price:cfg.updateExistingPrice,p_idempotency_key:row.idempotency_key});if(error)throw error;row.imported=true;row.importResult=data;success++;}catch(error){row.errors=[error?.message||'บันทึกไม่สำเร็จ'];failed++;}setMessage(`กำลังบันทึก ${i+1}/${rows.length} · สำเร็จ ${success} · ล้มเหลว ${failed}`,failed?'error':'');if((i+1)%5===0||i===rows.length-1)renderRows();}
    state.busy=false;E.previewConfirm.disabled=false;saveDraft();await reloadProducts();validateRows();setMessage(`นำเข้าเสร็จ: สำเร็จ ${success} รายการ · ล้มเหลว ${failed} รายการ`,failed?'error':'success');
  }

  async function reloadProducts(){state.products=[];const size=1000;for(let from=0;;from+=size){const r=await supabaseClient.from('products').select('id,product_code,name,barcode,cost_price,selling_price,vat_rate,is_active').range(from,from+size-1);if(r.error)break;const batch=r.data||[];state.products.push(...batch);if(batch.length<size)break;}state.byCode=new Map(state.products.map(p=>[normalizeCode(p.product_code),p]));state.byBarcode=new Map(state.products.filter(p=>p.barcode).map(p=>[String(p.barcode),p]));}

  E.rowsBody.addEventListener('input',event=>{const tr=event.target.closest('[data-row-id]');if(!tr)return;const row=state.rows.find(r=>r.id===tr.dataset.rowId);const field=event.target.dataset.field;if(!row||!field)return;row[field]=event.target.type==='checkbox'?event.target.checked:event.target.value;row.errors=[];saveDraft();});
  E.rowsBody.addEventListener('change',event=>{const tr=event.target.closest('[data-row-id]');if(!tr)return;const row=state.rows.find(r=>r.id===tr.dataset.rowId);const field=event.target.dataset.field;if(row&&field)row[field]=event.target.type==='checkbox'?event.target.checked:event.target.value;validateRows();saveDraft();});
  E.rowsBody.addEventListener('click',event=>{const id=event.target.dataset.deleteRow;if(!id)return;state.rows=state.rows.filter(r=>r.id!==id);renderRows();saveDraft();});
  E.addRowBtn.onclick=()=>{state.rows.push(newRow());renderRows();setTimeout(()=>E.rowsBody.querySelector('tr:last-child [data-field="product_code"]')?.focus(),0);};
  E.clearRowsBtn.onclick=()=>{if(confirm('ล้างรายการและร่างทั้งหมดหรือไม่?')){state.rows=[newRow()];localStorage.removeItem(STORAGE_KEY);renderRows();setMessage('ล้างพื้นที่ทำงานแล้ว');}};
  E.pasteRowsBtn.onclick=parsePastedRows;E.calculateBtn.onclick=calculateSelected;E.validateBtn.onclick=validateRows;E.saveDraftBtn.onclick=()=>saveDraft(false);E.importBtn.onclick=previewImport;E.previewClose.onclick=()=>E.previewDialog.close();E.previewCancel.onclick=()=>E.previewDialog.close();E.previewConfirm.onclick=confirmImport;
  E.selectAll.onchange=()=>{state.rows.filter(r=>!r.imported).forEach(r=>r.selected=E.selectAll.checked);renderRows();saveDraft();};
  document.querySelectorAll('[data-preset]').forEach(button=>button.onclick=()=>{E.markupPercent.value=button.dataset.preset;document.querySelectorAll('[data-preset]').forEach(x=>x.classList.toggle('active',x===button));});
  ['defaultBranch','defaultSupplier','defaultReference','markupPercent','vatRate','vatMode','roundPrice','updateExistingPrice'].forEach(id=>E[id].addEventListener('change',()=>saveDraft()));

  async function init(){try{const access=await window.TKNAuthGuard.requireAccess('product.manage',{loadingText:'กำลังตรวจสอบสิทธิ์นำเข้าสินค้าด้วยตนเอง...'});if(!access)return;await loadReferences();const restored=loadDraft();if(!restored)state.rows=[newRow()];validateRows();window.TKNAuthGuard.ready();setMessage(restored?'กู้คืนร่างล่าสุดแล้ว สามารถตรวจและทำต่อได้':'พร้อมเพิ่มสินค้าเอง กรุณากรอกข้อมูลหรือวางจาก Excel');supabaseClient.auth.onAuthStateChange((_event,session)=>{if(!session)location.replace('./dashboard.html');});}catch(error){console.error(error);window.TKNAuthGuard.fail(error,()=>location.reload());}}
  init();
})();
