(() => {
  'use strict';
  const VERSION='5.30.3';
  const PRODUCT_KEY='tkn_print_platform_product_v5303';
  const BOX_KEY='tkn_print_platform_box_v5303';
  const PRODUCT_DEFAULTS=Object.freeze({printerMode:'AUTO',dpi:300,preset:'label58',customWidth:58,customHeight:38,columns:1,gap:2,pageMargin:0,codeMode:'both',conciseName:true,showName:true,showPrice:false,showProductCode:true,showBarcodeText:false});
  const BOX_DEFAULTS=Object.freeze({printerMode:'AUTO',dpi:300,preset:'label58',customWidth:58,customHeight:38,columns:1,gap:2,pageMargin:0,codeMode:'both',copies:1,showDetails:true,showBarcodeText:false});
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number.isFinite(Number(n))?Number(n):min));
  const bool=(v,f)=>typeof v==='boolean'?v:f;
  function read(key,defaults){try{return {...defaults,...JSON.parse(localStorage.getItem(key)||'{}')}}catch{return {...defaults}}}
  function write(key,defaults,value){const clean={...defaults,...value};try{localStorage.setItem(key,JSON.stringify(clean))}catch{};window.dispatchEvent(new CustomEvent('tkn-print-settings-change',{detail:{key,settings:clean}}));return clean}
  function normalizeProduct(v={}){return {...PRODUCT_DEFAULTS,...v,dpi:[203,300,600].includes(Number(v.dpi))?Number(v.dpi):300,columns:Math.round(clamp(v.columns,1,8)),gap:clamp(v.gap,0,20),pageMargin:clamp(v.pageMargin,0,30),customWidth:clamp(v.customWidth,20,210),customHeight:clamp(v.customHeight,15,297),codeMode:['qr','both','barcode'].includes(v.codeMode)?v.codeMode:'both',conciseName:bool(v.conciseName,true),showName:bool(v.showName,true),showPrice:bool(v.showPrice,false),showProductCode:bool(v.showProductCode,true),showBarcodeText:bool(v.showBarcodeText,false)}}
  function normalizeBox(v={}){return {...BOX_DEFAULTS,...v,dpi:[203,300,600].includes(Number(v.dpi))?Number(v.dpi):300,columns:Math.round(clamp(v.columns,1,8)),gap:clamp(v.gap,0,20),pageMargin:clamp(v.pageMargin,0,30),copies:Math.round(clamp(v.copies,1,20)),customWidth:clamp(v.customWidth,20,210),customHeight:clamp(v.customHeight,15,297),codeMode:['qr','both','barcode'].includes(v.codeMode)?v.codeMode:'both',showDetails:bool(v.showDetails,true),showBarcodeText:bool(v.showBarcodeText,false)}}
  const getProductSettings=()=>normalizeProduct(read(PRODUCT_KEY,PRODUCT_DEFAULTS));
  const saveProductSettings=(v)=>write(PRODUCT_KEY,PRODUCT_DEFAULTS,normalizeProduct(v));
  const getBoxSettings=()=>normalizeBox(read(BOX_KEY,BOX_DEFAULTS));
  const saveBoxSettings=(v)=>write(BOX_KEY,BOX_DEFAULTS,normalizeBox(v));
  function resolvePrintMode(settings,width){const mode=String(settings?.printerMode||'AUTO').toUpperCase();if(mode==='ROLL'||mode==='SHEET')return mode;return Number(settings?.columns||1)===1&&Number(width||0)<=100?'ROLL':'SHEET'}
  async function capture(element,{scale=3,backgroundColor='#fff'}={}){if(!element)throw new Error('ไม่พบพื้นที่พิมพ์');if(typeof window.html2canvas!=='function')throw new Error('ระบบสร้าง PNG ยังไม่พร้อม');if(document.fonts?.ready){try{await document.fonts.ready}catch{}}return window.html2canvas(element,{scale,backgroundColor,useCORS:true,logging:false})}
  async function downloadPng(element,filename='tkn-label.png'){const canvas=await capture(element);const a=document.createElement('a');a.download=filename;a.href=canvas.toDataURL('image/png');a.click()}
  async function sharePng(element,filename='tkn-label.png'){const canvas=await capture(element);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('สร้างไฟล์ PNG ไม่สำเร็จ');const file=new File([blob],filename,{type:'image/png'});if(navigator.canShare?.({files:[file]})&&navigator.share){await navigator.share({files:[file],title:'TKN Print Label'});return}await downloadPng(element,filename)}
  window.TKNPrintPlatform=Object.freeze({VERSION,PRODUCT_DEFAULTS,BOX_DEFAULTS,getProductSettings,saveProductSettings,getBoxSettings,saveBoxSettings,normalizeProduct,normalizeBox,resolvePrintMode,capture,downloadPng,sharePng});
})();