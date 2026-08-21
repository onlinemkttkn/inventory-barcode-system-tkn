(function initTknCodeDownload(global){
  'use strict';
  const VERSION='5.31.30.2';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cleanFile=v=>String(v||'code').replace(/[^0-9A-Za-zก-๙._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'code';
  const qrEngine=()=>global.QRCode?.toCanvas||global.TKNQR?.toCanvas;
  const blob=(canvas)=>new Promise((resolve,reject)=>canvas.toBlob(v=>v?resolve(v):reject(new Error('สร้างไฟล์ PNG ไม่สำเร็จ')),'image/png'));
  function downloadBlob(value,name){const url=URL.createObjectURL(value);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  function fitText(ctx,text,maxWidth,start=34,min=18){let size=start;do{ctx.font=`800 ${size}px Prompt,Tahoma,sans-serif`;if(ctx.measureText(text).width<=maxWidth)return size;size-=1}while(size>min);return min}
  function normalized(input){
    const kind=input.kind==='BOX'?'BOX':'PRODUCT';
    const pattern=global.TKNProductPattern;
    if(kind==='BOX')return{kind,title:input.title||input.box_code||'กล่อง',qr:String(input.qr_payload||input.box_code||''),barcode:String(input.box_code||''),meta:input.meta||[input.category_text,input.zone_code&&`โซน ${input.zone_code}`].filter(Boolean).join(' · ')};
    const barcode=String(input.barcode_value||pattern?.barcodeValue?.(input)||input.product_code||input.barcode||'');
    return{kind,title:input.label_name||input.name||'สินค้า',qr:String(input.qr_value||pattern?.qrValue?.(input)||(barcode?`TKN-P-${barcode}`:'')),barcode,meta:input.meta||[input.product_type_th,input.brand_name,input.model_name].filter(Boolean).join(' · ')};
  }
  async function renderParts(raw){
    const item=normalized(raw);if(!item.qr||!item.barcode)throw new Error('ไม่พบรหัสสำหรับสร้าง QR Code หรือ Barcode');
    const toCanvas=qrEngine();if(typeof toCanvas!=='function')throw new Error('ระบบสร้าง QR Code ยังไม่พร้อม กรุณารีเฟรชหน้า');
    if(typeof global.JsBarcode!=='function')throw new Error('ระบบสร้าง Barcode ยังไม่พร้อม กรุณารีเฟรชหน้า');
    const qr=document.createElement('canvas');await toCanvas(qr,item.qr,{width:420,margin:2,errorCorrectionLevel:'M'});
    const bar=document.createElement('canvas');global.JsBarcode(bar,item.barcode,{format:'CODE128',displayValue:true,font:'Tahoma',fontSize:22,textMargin:8,margin:12,width:item.barcode.length>24?1.25:1.65,height:125,background:'#fff',lineColor:'#000'});
    const combined=document.createElement('canvas');combined.width=1200;combined.height=720;const c=combined.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,combined.width,combined.height);c.strokeStyle='#d7dce3';c.lineWidth=3;c.strokeRect(3,3,1194,714);
    c.fillStyle='#111';c.textAlign='center';const size=fitText(c,item.title,1080);c.font=`800 ${size}px Prompt,Tahoma,sans-serif`;c.fillText(item.title,600,58);c.drawImage(qr,55,105,420,420);c.drawImage(bar,520,165,625,230);
    c.font='700 25px ui-monospace,monospace';c.fillText(item.kind==='BOX'?item.barcode:item.barcode,832,435);c.font='500 24px Prompt,Tahoma,sans-serif';c.fillStyle='#424a57';c.fillText(item.meta||`${item.kind==='BOX'?'QR กล่อง':'QR และ Barcode สินค้า'}`,832,485);c.font='700 22px ui-monospace,monospace';c.fillStyle='#111';c.fillText(item.qr,265,570);c.font='600 20px Prompt,Tahoma,sans-serif';c.fillStyle='#667085';c.fillText('TKN POS / ERP · รหัสเดียวกับระบบขายและสต็อก',600,665);
    return{item,qr,bar,combined};
  }
  function ensureModal(){
    let d=document.getElementById('tknCodeDownloadDialog');if(d)return d;
    d=document.createElement('dialog');d.id='tknCodeDownloadDialog';d.className='tkn-code-dialog';d.innerHTML=`<div class="tkn-code-card"><header><div><small>QR / BARCODE PREVIEW</small><h2 id="tknCodeTitle">ดูและดาวน์โหลดรหัส</h2></div><button type="button" data-code-close aria-label="ปิด">×</button></header><div id="tknCodePreview" class="tkn-code-preview"></div><p id="tknCodeValue" class="tkn-code-value"></p><div class="tkn-code-actions"><button type="button" data-code-download="qr">ดาวน์โหลด QR PNG</button><button type="button" data-code-download="barcode">ดาวน์โหลด Barcode PNG</button><button type="button" class="primary" data-code-download="combined">ดาวน์โหลดแบบรวม PNG</button></div></div>`;document.body.appendChild(d);d.querySelector('[data-code-close]').onclick=()=>d.close();d.addEventListener('click',e=>{if(e.target===d)d.close()});return d;
  }
  async function open(raw){
    const d=ensureModal(),host=d.querySelector('#tknCodePreview');host.innerHTML='<p>กำลังสร้างตัวอย่าง...</p>';if(!d.open)d.showModal();
    try{const parts=await renderParts(raw);d.querySelector('#tknCodeTitle').textContent=parts.item.title;host.innerHTML='';host.appendChild(parts.combined);d.querySelector('#tknCodeValue').textContent=`QR: ${parts.item.qr} · Barcode: ${parts.item.barcode}`;d.querySelectorAll('[data-code-download]').forEach(b=>b.onclick=async()=>{const type=b.dataset.codeDownload;const canvas=type==='qr'?parts.qr:type==='barcode'?parts.bar:parts.combined;downloadBlob(await blob(canvas),`${cleanFile(parts.item.title)}-${type}.png`)})}catch(error){host.innerHTML=`<p class="error">${esc(error.message||error)}</p>`}
  }
  function chooseMode(title,count){return new Promise(resolve=>{const d=document.createElement('dialog');d.className='tkn-code-dialog';d.innerHTML=`<div class="tkn-code-card"><header><div><small>DOWNLOAD OPTIONS</small><h2>${esc(title)}</h2></div><button type="button" data-choice="cancel" aria-label="ปิด">×</button></header><p>เลือกแล้ว <b>${Number(count).toLocaleString('th-TH')}</b> รายการ กรุณาเลือกรูปแบบไฟล์</p><div class="tkn-choice-grid"><button type="button" data-choice="qr"><span class="tkn-choice-preview qr-sample" aria-hidden="true"></span><strong>QR Code เท่านั้น</strong><small>ไฟล์ PNG รูปสี่เหลี่ยม</small></button><button type="button" data-choice="barcode"><span class="tkn-choice-preview barcode-sample" aria-hidden="true"></span><strong>Barcode เท่านั้น</strong><small>ไฟล์ PNG แนวนอน</small></button><button type="button" class="recommended" data-choice="combined"><span class="tkn-choice-preview combined-sample" aria-hidden="true"><i class="qr-sample"></i><i class="barcode-sample"></i></span><strong>QR + Barcode รวม</strong><small>อยู่ในภาพเดียวกัน · แนะนำ</small></button></div><button class="tkn-choice-cancel" type="button" data-choice="cancel">ยกเลิก</button></div>`;document.body.appendChild(d);let done=false;const finish=value=>{if(done)return;done=true;d.close();d.remove();resolve(value)};d.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>finish(b.dataset.choice==='cancel'?null:b.dataset.choice));d.addEventListener('cancel',e=>{e.preventDefault();finish(null)});d.addEventListener('click',e=>{if(e.target===d)finish(null)});d.showModal()})}
  async function downloadZip(items,prefix='TKN-CODES',mode='combined'){
    if(!Array.isArray(items)||!items.length)throw new Error('กรุณาเลือกรายการอย่างน้อย 1 รายการ');if(typeof global.JSZip!=='function')throw new Error('ระบบ ZIP ยังไม่พร้อม กรุณารีเฟรชหน้า');
    const zip=new global.JSZip();for(let i=0;i<items.length;i+=1){const p=await renderParts(items[i]);const canvas=mode==='qr'?p.qr:mode==='barcode'?p.bar:p.combined;zip.file(`${String(i+1).padStart(3,'0')}-${cleanFile(p.item.title)}-${cleanFile(p.item.barcode)}-${mode}.png`,await blob(canvas));}
    downloadBlob(await zip.generateAsync({type:'blob',compression:'DEFLATE'}),`${cleanFile(prefix)}-${mode}-${new Date().toISOString().slice(0,10)}.zip`);
  }
  async function chooseAndDownload(items,kind){if(!Array.isArray(items)||!items.length)throw new Error('กรุณาเลือกรายการอย่างน้อย 1 รายการ');const mode=await chooseMode(kind==='BOX'?'ดาวน์โหลดรหัสกล่อง':'ดาวน์โหลดรหัสสินค้า',items.length);if(!mode)return{cancelled:true};await downloadZip(items.map(x=>({...x,kind})),kind==='BOX'?'TKN-BOX-CODES':'TKN-PRODUCT-CODES',mode);return{cancelled:false,mode}}
  global.TKNCodeDownload=Object.freeze({version:VERSION,openProduct:p=>open({...p,kind:'PRODUCT'}),openBox:b=>open({...b,kind:'BOX'}),downloadProductZip:items=>chooseAndDownload(items,'PRODUCT'),downloadBoxZip:items=>chooseAndDownload(items,'BOX')});
})(window);
