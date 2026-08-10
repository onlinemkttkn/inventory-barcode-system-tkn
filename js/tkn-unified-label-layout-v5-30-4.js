(() => {
  'use strict';
  const VERSION = '5.30.4';
  const PRESETS = Object.freeze({
    '20x10':[20,10], '30x20':[30,20], '32x25':[32,25],
    '40x20':[40,20], '40x30':[40,30], '40x70':[40,70],
    '50x20':[50,20], '50x30':[50,30], '50x40':[50,40],
    label58:[58,38], peripage57:[57,35], portable50x30:[50,30], portable40x30:[40,30],
    label80:[80,48], 'a4-40x30':[40,30], 'a4-50x30':[50,30], 'a4-70x40':[70,40],
    '58x40':[58,40], '70x70':[70,70], '100x70':[100,70],
  });
  const RECOMMENDED_COLUMNS = Object.freeze({
    '20x10':3,
    '30x20':3,
    '40x20':2,
    '40x30':2,
    '40x70':2,
    '50x20':2,
    '50x30':2,
  });
  const recommendedColumns=(preset,fallback=1)=>RECOMMENDED_COLUMNS[preset] || fallback;
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const num=(v,f)=>Number.isFinite(Number(v))?Number(v):f;
  const mmToPx=(mm,dpi=300)=>Math.max(1,Math.round((num(mm,1)/25.4)*num(dpi,300)));

  function sizeFor(preset, customWidth, customHeight, fallback=[50,40]) {
    if (String(preset||'').toUpperCase()==='CUSTOM' || String(preset||'').toLowerCase()==='custom') {
      return [clamp(num(customWidth,fallback[0]),20,210), clamp(num(customHeight,fallback[1]),10,297)];
    }
    return PRESETS[preset] || fallback;
  }

  function productProfile({preset='50x40', width, height, customWidth, customHeight, dpi=300}={}) {
    const resolved = width && height ? [num(width,50),num(height,40)] : sizeFor(preset,customWidth,customHeight,[50,40]);
    const w=resolved[0], h=resolved[1], short=Math.min(w,h);

    let padding,qr,barcodeHeight,qrBarcodeGap,contentGap,skuFont,nameFont,nameLines,density='standard';
    if(h<=12){
      density='micro';
      padding=clamp(short*0.03,0.28,0.42);
      qr=clamp(short*0.36,3.6,4.2);
      barcodeHeight=clamp(short*0.18,1.7,2.0);
      qrBarcodeGap=clamp(short*0.014,0.12,0.18);
      contentGap=clamp(short*0.012,0.10,0.16);
      skuFont=clamp(short*0.46,4.4,4.8);
      nameFont=4.2;
      nameLines=1;
    }else if(h<=20){
      density='compact';
      padding=clamp(short*0.028,0.45,0.65);
      qr=clamp(short*0.30,5.0,6.2);
      barcodeHeight=clamp(short*0.14,2.5,3.0);
      qrBarcodeGap=clamp(short*0.02,0.30,0.42);
      contentGap=clamp(short*0.012,0.18,0.28);
      skuFont=clamp(short*0.28,5.2,5.8);
      nameFont=clamp(short*0.26,4.9,5.5);
      nameLines=1;
    }else{
      padding=clamp(short*0.035,0.75,1.45);
      qr=clamp(short*0.33,8,16);
      barcodeHeight=clamp(short*0.155,3.8,7.2);
      qrBarcodeGap=clamp(short*0.045,0.9,1.8);
      contentGap=clamp(short*0.018,0.35,0.75);
      skuFont=clamp(short*0.22,6.5,10);
      nameFont=clamp(short*0.215,6.2,9.6);
      nameLines=h>=35?2:1;
    }
    return {
      width:w,height:h,qr,barcodeHeight,qrBarcodeGap,contentGap,padding,
      skuFont,nameFont,nameWeight:800,skuWeight:850,nameLines,density,dpi:num(dpi,300),
      recommendedColumns:recommendedColumns(preset,1),
      qrPx:mmToPx(qr,dpi),barcodePx:mmToPx(barcodeHeight,dpi),
    };
  }

  function boxProfile({preset='70x70',width,height,customWidth,customHeight,showDetails=true}={}) {
    const resolved = width && height ? [num(width,70),num(height,70)] : sizeFor(preset,customWidth,customHeight,[70,70]);
    const w=resolved[0], h=resolved[1], short=Math.min(w,h);
    return {
      width:w,height:h,
      qr:clamp(short*(showDetails?0.58:0.70),22,Math.min(w-8,h-12)),
      padding:clamp(short*0.045,2,4),
      gap:clamp(short*0.018,0.8,1.6),
    };
  }

  function applyProductVars(target, profile) {
    if (!target || !profile) return;
    const s=target.style;
    s.setProperty('--tkn-label-w',`${profile.width}mm`);
    s.setProperty('--tkn-label-h',`${profile.height}mm`);
    s.setProperty('--tkn-label-padding',`${profile.padding}mm`);
    s.setProperty('--tkn-label-qr',`${profile.qr}mm`);
    s.setProperty('--tkn-label-barcode',`${profile.barcodeHeight}mm`);
    s.setProperty('--tkn-label-qr-bar-gap',`${profile.qrBarcodeGap}mm`);
    s.setProperty('--tkn-label-gap',`${profile.contentGap}mm`);
    s.setProperty('--tkn-label-sku-font',`${profile.skuFont}px`);
    s.setProperty('--tkn-label-name-font',`${profile.nameFont}px`);
    s.setProperty('--tkn-label-name-lines',String(profile.nameLines));
    s.setProperty('--tkn-label-name-weight',String(profile.nameWeight));
    s.setProperty('--tkn-label-sku-weight',String(profile.skuWeight));
    target.dataset.tknLabelDensity=profile.density || 'standard';
  }

  window.TKNLabelLayout = Object.freeze({
    VERSION, PRESETS, RECOMMENDED_COLUMNS, recommendedColumns,
    sizeFor, productProfile, boxProfile, applyProductVars, mmToPx
  });
})();