const E = {
  categoryCode: document.getElementById('categoryCode'),
  categoryName: document.getElementById('categoryName'),
  parentCategory: document.getElementById('parentCategory'),
  addCategory: document.getElementById('addCategory'),
  cancelCategoryEdit: document.getElementById('cancelCategoryEdit'),
  categoryList: document.getElementById('categoryList'),
  unitName: document.getElementById('unitName'),
  addUnit: document.getElementById('addUnit'),
  cancelUnitEdit: document.getElementById('cancelUnitEdit'),
  unitList: document.getElementById('unitList'),
  brandCode: document.getElementById('brandCode'),
  brandName: document.getElementById('brandName'),
  addBrand: document.getElementById('addBrand'),
  cancelBrandEdit: document.getElementById('cancelBrandEdit'),
  brandList: document.getElementById('brandList'),
  message: document.getElementById('message')
};

const S = {
  categories: [],
  units: [],
  brands: [],
  editingCategoryId: null,
  editingUnitId: null,
  editingBrandId: null
};

function msg(text, className = '') {
  E.message.textContent = text;
  E.message.className = `msg master-message ${className}`.trim();
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

function friendlyError(error, itemLabel) {
  if (!error) return 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
  if (error.code === '23505') {
    return `${itemLabel}นี้มีรหัสหรือชื่อซ้ำกับข้อมูลเดิม กรุณาตรวจสอบอีกครั้ง`;
  }
  if (error.code === '42501') {
    return `บัญชีนี้ไม่มีสิทธิ์แก้ไข${itemLabel} กรุณาเข้าสู่ระบบด้วย Owner หรือ Admin`;
  }
  return error.message || `ไม่สามารถบันทึก${itemLabel}ได้`;
}

function getDescendantIds(rootId) {
  const descendants = new Set();
  const queue = [rootId];

  while (queue.length) {
    const currentId = queue.shift();
    S.categories.forEach((category) => {
      if (category.parent_id === currentId && !descendants.has(category.id)) {
        descendants.add(category.id);
        queue.push(category.id);
      }
    });
  }

  return descendants;
}

function renderParentOptions({ excludeId = null, selectedId = '' } = {}) {
  const blockedIds = excludeId ? getDescendantIds(excludeId) : new Set();
  if (excludeId) blockedIds.add(excludeId);

  const options = S.categories
    .filter((category) => !blockedIds.has(category.id))
    .map((category) => (
      `<option value="${esc(category.id)}">${esc(category.code)} — ${esc(category.name)}</option>`
    ))
    .join('');

  E.parentCategory.innerHTML = `<option value="">หมวดหมู่หลัก</option>${options}`;
  E.parentCategory.value = selectedId || '';
}

function renderCategories() {
  const categoryMap = new Map(S.categories.map((category) => [category.id, category]));

  E.categoryList.innerHTML = S.categories.map((category) => {
    const parent = category.parent_id ? categoryMap.get(category.parent_id) : null;
    const parentText = parent
      ? `หมวดหมู่แม่: ${esc(parent.code)} — ${esc(parent.name)}`
      : 'หมวดหมู่หลัก';

    return `
      <div class="item master-data-item ${S.editingCategoryId === category.id ? 'is-selected' : ''}">
        <div class="master-item-row">
          <div class="master-item-main">
            <b>${esc(category.code)}</b>
            <span class="master-item-copy">
              <small>${esc(category.name)}</small>
              <em>${parentText}</em>
            </span>
          </div>
          <button class="item-edit-btn" type="button" data-action="edit-category" data-id="${esc(category.id)}">
            แก้ไข
          </button>
        </div>
      </div>`;
  }).join('');
}

function renderUnits() {
  E.unitList.innerHTML = S.units.map((unit) => `
    <div class="item master-data-item ${S.editingUnitId === unit.id ? 'is-selected' : ''}">
      <div class="master-item-row">
        <div class="master-item-main unit-item-main">
          <b>${esc(unit.name)}</b>
        </div>
        <button class="item-edit-btn" type="button" data-action="edit-unit" data-id="${esc(unit.id)}">
          แก้ไข
        </button>
      </div>
    </div>`).join('');
}

function renderBrands() {
  E.brandList.innerHTML = S.brands.map((brand) => `
    <div class="item master-data-item ${S.editingBrandId === brand.id ? 'is-selected' : ''}">
      <div class="master-item-row">
        <div class="master-item-main">
          <b>${esc(brand.code)}</b>
          <span class="master-item-copy">
            <small>${esc(brand.name)}</small>
          </span>
        </div>
        <button class="item-edit-btn" type="button" data-action="edit-brand" data-id="${esc(brand.id)}">
          แก้ไข
        </button>
      </div>
    </div>`).join('');
}

async function load() {
  const [categoriesResult, unitsResult, brandsResult] = await Promise.all([
    supabaseClient.from('categories').select('*').order('code'),
    supabaseClient.from('units').select('*').order('name'),
    supabaseClient.from('brands').select('*').order('name')
  ]);

  const error = [categoriesResult.error, unitsResult.error, brandsResult.error].find(Boolean);
  if (error) {
    msg(error.message, 'error');
    return;
  }

  S.categories = categoriesResult.data || [];
  S.units = unitsResult.data || [];
  S.brands = brandsResult.data || [];

  renderParentOptions();
  renderCategories();
  renderUnits();
  renderBrands();
}

function resetCategoryForm() {
  S.editingCategoryId = null;
  E.categoryCode.value = '';
  E.categoryName.value = '';
  renderParentOptions();
  E.addCategory.innerHTML = '<span aria-hidden="true">＋</span> เพิ่มหมวดหมู่';
  E.cancelCategoryEdit.hidden = true;
  document.querySelector('.category-card')?.classList.remove('is-editing');
  renderCategories();
}

function resetUnitForm() {
  S.editingUnitId = null;
  E.unitName.value = '';
  E.addUnit.innerHTML = '<span aria-hidden="true">＋</span> เพิ่มหน่วยนับ';
  E.cancelUnitEdit.hidden = true;
  document.querySelector('.unit-card')?.classList.remove('is-editing');
  renderUnits();
}

function resetBrandForm() {
  S.editingBrandId = null;
  E.brandCode.value = '';
  E.brandName.value = '';
  E.addBrand.innerHTML = '<span aria-hidden="true">＋</span> เพิ่มยี่ห้อ';
  E.cancelBrandEdit.hidden = true;
  document.querySelector('.brand-card')?.classList.remove('is-editing');
  renderBrands();
}

function beginCategoryEdit(id) {
  const category = S.categories.find((item) => item.id === id);
  if (!category) return;

  S.editingCategoryId = id;
  E.categoryCode.value = category.code || '';
  E.categoryName.value = category.name || '';
  renderParentOptions({ excludeId: id, selectedId: category.parent_id || '' });
  E.addCategory.innerHTML = '<span aria-hidden="true">✓</span> บันทึกการแก้ไข';
  E.cancelCategoryEdit.hidden = false;
  document.querySelector('.category-card')?.classList.add('is-editing');
  renderCategories();
  msg(`กำลังแก้ไขหมวดหมู่ ${category.code} — ${category.name}`, 'editing');
  E.categoryCode.focus();
  document.querySelector('.category-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function beginUnitEdit(id) {
  const unit = S.units.find((item) => item.id === id);
  if (!unit) return;

  S.editingUnitId = id;
  E.unitName.value = unit.name || '';
  E.addUnit.innerHTML = '<span aria-hidden="true">✓</span> บันทึกการแก้ไข';
  E.cancelUnitEdit.hidden = false;
  document.querySelector('.unit-card')?.classList.add('is-editing');
  renderUnits();
  msg(`กำลังแก้ไขหน่วยนับ ${unit.name}`, 'editing');
  E.unitName.focus();
  document.querySelector('.unit-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function beginBrandEdit(id) {
  const brand = S.brands.find((item) => item.id === id);
  if (!brand) return;

  S.editingBrandId = id;
  E.brandCode.value = brand.code || '';
  E.brandName.value = brand.name || '';
  E.addBrand.innerHTML = '<span aria-hidden="true">✓</span> บันทึกการแก้ไข';
  E.cancelBrandEdit.hidden = false;
  document.querySelector('.brand-card')?.classList.add('is-editing');
  renderBrands();
  msg(`กำลังแก้ไขยี่ห้อ ${brand.code} — ${brand.name}`, 'editing');
  E.brandCode.focus();
  document.querySelector('.brand-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

E.addCategory.addEventListener('click', async () => {
  const code = E.categoryCode.value.trim();
  const name = E.categoryName.value.trim();
  const parentId = E.parentCategory.value || null;

  if (!code || !name) {
    msg('กรุณากรอกรหัสหมวดหมู่และชื่อหมวดหมู่ให้ครบ', 'error');
    (!code ? E.categoryCode : E.categoryName).focus();
    return;
  }

  if (S.editingCategoryId && parentId) {
    const blockedIds = getDescendantIds(S.editingCategoryId);
    blockedIds.add(S.editingCategoryId);
    if (blockedIds.has(parentId)) {
      msg('ไม่สามารถเลือกหมวดหมู่ตัวเองหรือหมวดหมู่ลูกเป็นหมวดหมู่แม่ได้', 'error');
      return;
    }
  }

  E.addCategory.disabled = true;

  try {
    const updatePayload = { code, name, parent_id: parentId };
    const insertPayload = { ...updatePayload, is_active: true };

    const result = S.editingCategoryId
      ? await supabaseClient.from('categories').update(updatePayload).eq('id', S.editingCategoryId)
      : await supabaseClient.from('categories').insert(insertPayload);

    if (result.error) {
      msg(friendlyError(result.error, 'หมวดหมู่'), 'error');
      return;
    }

    const successText = S.editingCategoryId
      ? 'แก้ไขหมวดหมู่เรียบร้อยแล้ว โดยยังคงรหัสเชื่อมโยงเดิมของระบบ'
      : 'เพิ่มหมวดหมู่เรียบร้อยแล้ว';

    resetCategoryForm();
    await load();
    msg(successText, 'ok');
  } finally {
    E.addCategory.disabled = false;
  }
});

E.addUnit.addEventListener('click', async () => {
  const name = E.unitName.value.trim();

  if (!name) {
    msg('กรุณากรอกชื่อหน่วยนับ', 'error');
    E.unitName.focus();
    return;
  }

  E.addUnit.disabled = true;

  try {
    const result = S.editingUnitId
      ? await supabaseClient.from('units').update({ name }).eq('id', S.editingUnitId)
      : await supabaseClient.from('units').insert({ name });

    if (result.error) {
      msg(friendlyError(result.error, 'หน่วยนับ'), 'error');
      return;
    }

    const successText = S.editingUnitId
      ? 'แก้ไขหน่วยนับเรียบร้อยแล้ว โดยข้อมูลสินค้ายังคงเชื่อมโยงกับรายการเดิม'
      : 'เพิ่มหน่วยนับเรียบร้อยแล้ว';

    resetUnitForm();
    await load();
    msg(successText, 'ok');
  } finally {
    E.addUnit.disabled = false;
  }
});

E.addBrand.addEventListener('click', async () => {
  const code = E.brandCode.value.trim();
  const name = E.brandName.value.trim();

  if (!code || !name) {
    msg('กรุณากรอกรหัสยี่ห้อและชื่อยี่ห้อให้ครบ', 'error');
    (!code ? E.brandCode : E.brandName).focus();
    return;
  }

  E.addBrand.disabled = true;

  try {
    const updatePayload = { code, name };
    const insertPayload = { ...updatePayload, is_active: true };
    const result = S.editingBrandId
      ? await supabaseClient.from('brands').update(updatePayload).eq('id', S.editingBrandId)
      : await supabaseClient.from('brands').insert(insertPayload);

    if (result.error) {
      msg(friendlyError(result.error, 'ยี่ห้อ'), 'error');
      return;
    }

    const successText = S.editingBrandId
      ? 'แก้ไขยี่ห้อเรียบร้อยแล้ว โดยข้อมูลสินค้ายังคงเชื่อมโยงกับรายการเดิม'
      : 'เพิ่มยี่ห้อเรียบร้อยแล้ว';

    resetBrandForm();
    await load();
    msg(successText, 'ok');
  } finally {
    E.addBrand.disabled = false;
  }
});

E.cancelCategoryEdit.addEventListener('click', () => {
  resetCategoryForm();
  msg('ยกเลิกการแก้ไขหมวดหมู่แล้ว');
});

E.cancelUnitEdit.addEventListener('click', () => {
  resetUnitForm();
  msg('ยกเลิกการแก้ไขหน่วยนับแล้ว');
});

E.cancelBrandEdit.addEventListener('click', () => {
  resetBrandForm();
  msg('ยกเลิกการแก้ไขยี่ห้อแล้ว');
});

E.categoryList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action="edit-category"]');
  if (button) beginCategoryEdit(button.dataset.id);
});

E.unitList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action="edit-unit"]');
  if (button) beginUnitEdit(button.dataset.id);
});

E.brandList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action="edit-brand"]');
  if (button) beginBrandEdit(button.dataset.id);
});

(async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    location.href = './dashboard.html';
    return;
  }
  await load();
})();
