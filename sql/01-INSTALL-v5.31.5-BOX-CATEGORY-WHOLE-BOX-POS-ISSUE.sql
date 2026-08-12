-- ============================================================================
-- TKN POS / ERP v5.31.5
-- BOX CATEGORY + WHOLE BOX POS ISSUE
--
-- เป้าหมาย
-- 1) ใช้ category_text เดิมของกล่องเป็น "ประเภทกล่อง" เพื่อค้นหาได้ง่าย
-- 2) เบิกขายหน้าร้านแบบทั้งกล่องจาก QR กล่องครั้งเดียว ไม่สแกนสินค้าในกล่องซ้ำ
-- 3) หลังเบิก ตรวจซ้ำว่า outside_box_available พร้อมให้ POS เห็นจริง
-- 4) ปลด lifecycle ของกล่องให้กลับมาใช้รอบใหม่ได้ (กล่องหมุนเวียน)
--
-- INSTALL เป็น additive: ไม่ล้างยอด, ไม่ TRUNCATE, ไม่แก้ยอด branch_inventory ตอนติดตั้ง
-- การนำสินค้าออกจากกล่องเกิดเฉพาะเมื่อผู้ใช้ยืนยัน RPC เบิกทั้งกล่องจริง
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- 0) Dependency guard — ถ้าไม่ครบ rollback ทั้งไฟล์
-- --------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.stock_boxes') is null
     or to_regclass('public.stock_box_items') is null
     or to_regclass('public.branch_inventory') is null
     or to_regclass('public.products') is null
     or to_regclass('public.tkn_box_history') is null
     or to_regclass('public.tkn_box_history_items') is null
     or to_regclass('public.tkn_v5261_box_tracking') is null
     or to_regclass('public.tkn_v5261_product_stock_position') is null then
    raise exception 'V5.31.5_DEPENDENCY_TABLE_OR_VIEW_MISSING';
  end if;

  if to_regprocedure('public.tkn_v5261_get_box_context(text)') is null
     or to_regprocedure('public.tkn_v5261_issue_box_to_storefront(text,uuid)') is null
     or to_regprocedure('public.tkn_v5261_has_permission(text)') is null
     or to_regprocedure('public.tkn_v5261_resolve_branch(uuid)') is null
     or to_regprocedure('public.tkn_v5283_close_box_to_waiting(text,uuid,text,text,text)') is null
     or to_regprocedure('public.tkn_v5309_commit_box_to_waiting(text,jsonb,text,text,text)') is null
     or to_regprocedure('public.tkn_v5309_can_sorting_create_product()') is null
     or to_regprocedure('public.tkn_v5300_warehouse_branch_id()') is null then
    raise exception 'V5.31.5_DEPENDENCY_FUNCTION_MISSING';
  end if;

  if not exists(
    select 1
    from pg_constraint c
    where c.conrelid='public.tkn_box_history'::regclass
      and c.contype='c'
      and pg_get_constraintdef(c.oid) ilike '%REOPENED%'
  ) then
    raise exception 'V5.31.5_HISTORY_STATUS_REOPENED_NOT_SUPPORTED';
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 1) Audit การตรวจและเบิกเข้า POS — sidecar ใหม่ ไม่แตะตารางบัญชีเดิม
-- --------------------------------------------------------------------------
create table if not exists public.tkn_v5315_whole_box_issue_audit(
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references public.stock_boxes(id) on delete restrict,
  box_code text not null,
  history_id uuid references public.tkn_box_history(id) on delete set null,
  branch_id uuid not null references public.branches(id) on delete restrict,
  category_text text,
  box_items_snapshot jsonb not null default '[]'::jsonb,
  issue_result jsonb not null default '{}'::jsonb,
  issued_by uuid,
  issued_at timestamptz not null default now()
);

create index if not exists idx_tkn_v5315_issue_audit_box
  on public.tkn_v5315_whole_box_issue_audit(box_id,issued_at desc);
create index if not exists idx_tkn_v5315_issue_audit_branch
  on public.tkn_v5315_whole_box_issue_audit(branch_id,issued_at desc);

alter table public.tkn_v5315_whole_box_issue_audit enable row level security;
revoke all on public.tkn_v5315_whole_box_issue_audit from public,anon,authenticated;
grant select on public.tkn_v5315_whole_box_issue_audit to authenticated;

drop policy if exists tkn_v5315_issue_audit_read on public.tkn_v5315_whole_box_issue_audit;
create policy tkn_v5315_issue_audit_read
  on public.tkn_v5315_whole_box_issue_audit
  for select to authenticated
  using(
    public.tkn_v5261_has_permission('inventory.view')
    or public.tkn_v5261_has_permission('inventory.issue')
    or public.tkn_v5261_has_permission('product.manage')
  );

-- --------------------------------------------------------------------------
-- 2) Context กล่อง + ประเภทกล่องจาก History ล่าสุด
-- --------------------------------------------------------------------------
create or replace function public.tkn_v5315_get_box_context(p_box_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $f$
declare
  v_base jsonb;
  v_box_id uuid;
  v_class jsonb;
  v_category text;
  v_box_type text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.tkn_v5261_has_permission('inventory.view')
     and not public.tkn_v5261_has_permission('inventory.issue')
     and not public.tkn_v5261_has_permission('inventory.box_transfer')
     and not public.tkn_v5261_has_permission('inventory.transfer')
     and not public.tkn_v5261_has_permission('inventory.receive')
     and not public.tkn_v5261_has_permission('product.manage') then
    raise exception 'PERMISSION_DENIED: inventory.view';
  end if;

  v_base := public.tkn_v5261_get_box_context(p_box_code);
  v_box_id := nullif(v_base #>> '{box,id}','')::uuid;

  select nullif(btrim(h.category_text),''),
         jsonb_build_object(
           'history_id',h.id,
           'revision',h.revision,
           'workflow_status',h.workflow_status,
           'category_text',h.category_text,
           'zone_code',h.zone_code,
           'history_location_text',h.location_text,
           'stock_received_at',h.stock_received_at
         )
  into v_category,v_class
  from public.tkn_box_history h
  where h.box_id=v_box_id
  order by h.revision desc,h.created_at desc
  limit 1;

  v_box_type := case
    when v_category is null then 'ไม่ระบุประเภท'
    when strpos(v_category,',')>0 then 'คละประเภท'
    else v_category
  end;

  v_class := coalesce(v_class,'{}'::jsonb)
    || jsonb_build_object('box_type',v_box_type);

  return coalesce(v_base,'{}'::jsonb)
    || jsonb_build_object('classification',v_class);
end $f$;

-- --------------------------------------------------------------------------
-- 3) Catalog กล่องตามประเภท / SKU / ชื่อสินค้า ของสาขาปัจจุบัน
--    แสดงเฉพาะ CLOSED + WAREHOUSE + IN_STOCK + มีสินค้า + ไม่อยู่ระหว่างโอน
-- --------------------------------------------------------------------------
create or replace function public.tkn_v5315_box_catalog(
  p_branch_id uuid,
  p_category text default null,
  p_search text default null,
  p_limit integer default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $f$
declare
  v_branch uuid;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.tkn_v5261_has_permission('inventory.view')
     and not public.tkn_v5261_has_permission('inventory.issue')
     and not public.tkn_v5261_has_permission('product.manage') then
    raise exception 'PERMISSION_DENIED: inventory.view';
  end if;

  v_branch := public.tkn_v5261_resolve_branch(p_branch_id);

  with eligible as (
    select
      b.id box_id,
      b.box_code,
      b.status::text box_status,
      t.branch_id,
      br.code branch_code,
      br.name branch_name,
      t.location_state,
      h.id history_id,
      h.revision,
      h.workflow_status,
      h.category_text,
      h.zone_code,
      coalesce(nullif(h.location_text,''),nullif(b.location_text,'')) location_text,
      case
        when nullif(btrim(h.category_text),'') is null then 'ไม่ระบุประเภท'
        when strpos(h.category_text,',')>0 then 'คละประเภท'
        else h.category_text
      end box_type,
      count(distinct i.sku)::integer sku_count,
      coalesce(sum(i.quantity),0)::numeric total_quantity,
      max(h.stock_received_at) stock_received_at
    from public.stock_boxes b
    join public.tkn_v5261_box_tracking t on t.box_id=b.id
    join public.branches br on br.id=t.branch_id
    join lateral (
      select x.*
      from public.tkn_box_history x
      where x.box_id=b.id
      order by x.revision desc,x.created_at desc
      limit 1
    ) h on true
    join public.stock_box_items i on i.box_id=b.id and i.quantity>0
    where t.branch_id=v_branch
      and t.location_state='WAREHOUSE'
      and t.active_transfer_id is null
      and upper(coalesce(b.status::text,''))='CLOSED'
      and h.workflow_status='IN_STOCK'
    group by b.id,b.box_code,b.status,t.branch_id,br.code,br.name,t.location_state,
             h.id,h.revision,h.workflow_status,h.category_text,h.zone_code,h.location_text,h.stock_received_at
  ), filtered as (
    select e.*
    from eligible e
    where (
      nullif(btrim(coalesce(p_category,'')),'') is null
      or (
        lower(btrim(p_category))=lower('คละประเภท')
        and e.box_type='คละประเภท'
      )
      or exists(
        select 1
        from regexp_split_to_table(coalesce(e.category_text,''),'\s*,\s*') c(category)
        where lower(btrim(c.category))=lower(btrim(p_category))
      )
    )
    and (
      nullif(btrim(coalesce(p_search,'')),'') is null
      or e.box_code ilike '%'||btrim(p_search)||'%'
      or coalesce(e.category_text,'') ilike '%'||btrim(p_search)||'%'
      or coalesce(e.zone_code,'') ilike '%'||btrim(p_search)||'%'
      or exists(
        select 1
        from public.stock_box_items si
        left join public.products p on p.id=si.product_id
        where si.box_id=e.box_id
          and si.quantity>0
          and (
            si.sku ilike '%'||btrim(p_search)||'%'
            or coalesce(p.barcode,'') ilike '%'||btrim(p_search)||'%'
            or coalesce(p.name,'') ilike '%'||btrim(p_search)||'%'
          )
      )
    )
    order by e.box_type,e.box_code
    limit greatest(1,least(coalesce(p_limit,200),500))
  ), category_tokens as (
    select distinct btrim(c.category) category
    from eligible e
    cross join lateral regexp_split_to_table(coalesce(e.category_text,''),'\s*,\s*') c(category)
    where nullif(btrim(c.category),'') is not null
    union
    select 'คละประเภท'
    from eligible e
    where e.box_type='คละประเภท'
  )
  select jsonb_build_object(
    'branch_id',v_branch,
    'categories',coalesce((select jsonb_agg(category order by category) from category_tokens),'[]'::jsonb),
    'boxes',coalesce((select jsonb_agg(to_jsonb(f) order by f.box_type,f.box_code) from filtered f),'[]'::jsonb)
  )
  into v_result;

  return v_result;
end $f$;

-- --------------------------------------------------------------------------
-- 4) Whole Box Issue: ยืนยัน QR กล่องครั้งเดียว ไม่สแกน SKU ภายในซ้ำ
--    Server ตรวจสถานะกล่อง + Snapshot เดิม + สาขา + POS-ready ก่อน commit
-- --------------------------------------------------------------------------
create or replace function public.tkn_v5315_issue_whole_box_to_storefront(
  p_box_code text,
  p_branch_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $f$
declare
  v_branch uuid;
  v_box public.stock_boxes%rowtype;
  v_history public.tkn_box_history%rowtype;
  v_tracking public.tkn_v5261_box_tracking%rowtype;
  v_expected jsonb;
  v_result jsonb;
  v_mismatch text;
  v_total_sku integer;
  v_total_quantity numeric;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.tkn_v5261_has_permission('inventory.issue')
     and not public.tkn_v5261_has_permission('product.manage') then
    raise exception 'PERMISSION_DENIED: inventory.issue';
  end if;

  v_branch := public.tkn_v5261_resolve_branch(p_branch_id);

  select * into v_box
  from public.stock_boxes
  where upper(box_code)=upper(btrim(p_box_code))
  for update;
  if not found then raise exception 'BOX_NOT_FOUND:%',p_box_code; end if;
  if upper(coalesce(v_box.status::text,''))<>'CLOSED' then raise exception 'BOX_NOT_CLOSED'; end if;

  select * into v_tracking
  from public.tkn_v5261_box_tracking
  where box_id=v_box.id
  for update;
  if not found then raise exception 'BOX_TRACKING_NOT_FOUND'; end if;
  if v_tracking.branch_id is distinct from v_branch then raise exception 'BOX_BRANCH_MISMATCH'; end if;
  if coalesce(v_tracking.location_state,'')<>'WAREHOUSE' then
    raise exception 'BOX_NOT_IN_WAREHOUSE:%',coalesce(v_tracking.location_state,'');
  end if;
  if v_tracking.active_transfer_id is not null then raise exception 'BOX_IN_TRANSIT'; end if;

  select * into v_history
  from public.tkn_box_history
  where box_id=v_box.id
  order by revision desc,created_at desc
  limit 1
  for update;
  if not found then raise exception 'BOX_HISTORY_NOT_FOUND'; end if;
  if v_history.workflow_status<>'IN_STOCK' then
    raise exception 'BOX_NOT_IN_STOCK:%',v_history.workflow_status;
  end if;

  -- ป้องกันข้อมูลกล่องถูกแก้หลังรับเข้าสต็อก:
  -- รายการปัจจุบันต้องตรงกับ Snapshot ประวัติ แต่ผู้ใช้ไม่ต้องสแกนสินค้าซ้ำ
  with current_items as (
    select i.product_id,upper(btrim(i.sku)) sku,sum(i.quantity)::numeric quantity
    from public.stock_box_items i
    where i.box_id=v_box.id and i.quantity>0
    group by i.product_id,upper(btrim(i.sku))
  ), history_items as (
    select i.product_id,upper(btrim(i.sku)) sku,sum(i.quantity)::numeric quantity
    from public.tkn_box_history_items i
    where i.history_id=v_history.id and i.quantity>0
    group by i.product_id,upper(btrim(i.sku))
  )
  select coalesce(c.sku,h.sku)
  into v_mismatch
  from current_items c
  full join history_items h on h.product_id=c.product_id and h.sku=c.sku
  where c.product_id is null or h.product_id is null or c.quantity<>h.quantity
  limit 1;

  if v_mismatch is not null then
    raise exception 'BOX_SNAPSHOT_CHANGED:%',v_mismatch;
  end if;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'product_id',x.product_id,
      'sku',x.sku,
      'quantity',x.quantity
    ) order by x.sku),'[]'::jsonb),
    count(*)::integer,
    coalesce(sum(x.quantity),0)::numeric
  into v_expected,v_total_sku,v_total_quantity
  from (
    select i.product_id,upper(btrim(i.sku)) sku,sum(i.quantity)::numeric quantity
    from public.stock_box_items i
    where i.box_id=v_box.id and i.quantity>0
    group by i.product_id,upper(btrim(i.sku))
  ) x;

  if v_total_sku=0 or v_total_quantity<=0 then raise exception 'BOX_EMPTY'; end if;

  -- ใช้ transaction เดียวกัน: ถ้า POS-ready check fail การเบิกทั้งกล่องจะ rollback
  v_result := public.tkn_v5261_issue_box_to_storefront(v_box.box_code,v_branch);

  -- POS ใช้ branch stock - จำนวนที่ยังอยู่ในกล่อง
  -- หลังเบิกทั้งกล่อง รายการทุก SKU ต้องพร้อมขายอย่างน้อยเท่ากับจำนวนเดิมในกล่อง
  with expected as (
    select x.product_id,upper(btrim(x.sku)) sku,x.quantity
    from jsonb_to_recordset(v_expected) as x(product_id uuid,sku text,quantity numeric)
  )
  select e.sku
  into v_mismatch
  from expected e
  left join public.tkn_v5261_product_stock_position p
    on p.branch_id=v_branch and p.product_id=e.product_id
  where coalesce(p.outside_box_available,0)<e.quantity
  limit 1;

  if v_mismatch is not null then
    raise exception 'POS_READY_CHECK_FAILED:%',v_mismatch;
  end if;

  update public.tkn_box_history
  set workflow_status='REOPENED',updated_at=now()
  where id=v_history.id and workflow_status='IN_STOCK';

  insert into public.tkn_v5315_whole_box_issue_audit(
    box_id,box_code,history_id,branch_id,category_text,box_items_snapshot,issue_result,issued_by
  ) values(
    v_box.id,v_box.box_code,v_history.id,v_branch,v_history.category_text,
    v_expected,
    coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
      'issued',true,'whole_box',true,'pos_ready',true,
      'total_sku',v_total_sku,'total_quantity',v_total_quantity
    ),
    auth.uid()
  );

  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
    'history_id',v_history.id,
    'category_text',v_history.category_text,
    'issued',true,
    'whole_box',true,
    'pos_ready',true,
    'total_sku',v_total_sku,
    'total_quantity',v_total_quantity,
    'box_items_snapshot',v_expected
  );
end $f$;

-- --------------------------------------------------------------------------
-- --------------------------------------------------------------------------
-- 5) ปรับ Commit กล่อง v5.30.9 ให้ "กล่องหมุนเวียน" ใช้รหัสเดิมใน revision ใหม่ได้
--    พฤติกรรม WAITING_STOCK / IN_STOCK เดิมคงเดิม
--    เพิ่มเฉพาะกรณี latest history = REOPENED/CANCELLED ให้สร้างรอบใหม่
-- --------------------------------------------------------------------------
create or replace function public.tkn_v5309_commit_box_to_waiting(
  p_box_code text,
  p_items jsonb,
  p_category_text text default null,
  p_zone_code text default null,
  p_location_text text default null
) returns jsonb
language plpgsql volatile security definer set search_path=''
as $f$
declare
  v_code text;
  v_box public.stock_boxes%rowtype;
  v_history public.tkn_box_history%rowtype;
  v_branch uuid;
  v_result jsonb;
  v_item record;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.tkn_v5309_can_sorting_create_product() then
    raise exception 'PERMISSION_DENIED: sorting/receive workflow';
  end if;

  v_code := upper(btrim(coalesce(p_box_code,'')));
  if v_code='' then raise exception 'BOX_CODE_REQUIRED'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'BOX_ITEMS_REQUIRED';
  end if;

  select count(*) into v_count
  from (
    select upper(btrim(x.sku)) sku
    from jsonb_to_recordset(p_items) as x(product_id uuid,sku text,quantity numeric)
    where nullif(btrim(x.sku),'') is not null
    group by upper(btrim(x.sku))
    having count(*)>1
  ) d;
  if v_count>0 then raise exception 'DUPLICATE_SKU_IN_BOX_PAYLOAD'; end if;

  for v_item in
    select x.product_id,upper(btrim(x.sku)) sku,x.quantity
    from jsonb_to_recordset(p_items) as x(product_id uuid,sku text,quantity numeric)
  loop
    if v_item.product_id is null then raise exception 'BOX_ITEM_PRODUCT_REQUIRED:%',coalesce(v_item.sku,'?'); end if;
    if nullif(v_item.sku,'') is null then raise exception 'BOX_ITEM_SKU_REQUIRED'; end if;
    if coalesce(v_item.quantity,0)<=0 then raise exception 'BOX_ITEM_QUANTITY_INVALID:%',v_item.sku; end if;
    if not exists(select 1 from public.products p where p.id=v_item.product_id) then
      raise exception 'PRODUCT_NOT_FOUND:%',v_item.product_id;
    end if;
  end loop;

  v_branch := public.tkn_v5300_warehouse_branch_id();
  if v_branch is null then raise exception 'WAREHOUSE_BRANCH_NOT_CONFIGURED'; end if;

  select * into v_box
  from public.stock_boxes
  where upper(box_code)=v_code
  limit 1
  for update;

  if found then
    select * into v_history
    from public.tkn_box_history
    where box_id=v_box.id
    order by revision desc,created_at desc
    limit 1;

    if found and v_history.workflow_status='IN_STOCK' then
      return jsonb_build_object(
        'box_id',v_box.id,'box_code',v_box.box_code,'history_id',v_history.id,
        'workflow_status','IN_STOCK','already_in_stock',true
      );
    end if;

    if found and v_history.workflow_status='WAITING_STOCK' then
      return jsonb_build_object(
        'box_id',v_box.id,'box_code',v_box.box_code,'history_id',v_history.id,
        'workflow_status','WAITING_STOCK','already_waiting',true
      );
    end if;

    if found and v_history.workflow_status not in('REOPENED','CANCELLED') then
      raise exception 'BOX_HISTORY_STATE_NOT_REUSABLE:%',v_history.workflow_status;
    end if;

    update public.stock_boxes
       set status='CLOSED',
           location_text=coalesce(nullif(btrim(p_location_text),''),location_text),
           closed_at=now()
     where id=v_box.id
     returning * into v_box;
  else
    insert into public.stock_boxes(box_code,status,location_text,closed_at)
    values(v_code,'CLOSED',nullif(btrim(p_location_text),''),now())
    returning * into v_box;
  end if;

  delete from public.stock_box_items where box_id=v_box.id;

  insert into public.stock_box_items(box_id,product_id,sku,quantity)
  select v_box.id,x.product_id,upper(btrim(x.sku)),x.quantity
  from jsonb_to_recordset(p_items) as x(product_id uuid,sku text,quantity numeric)
  where x.quantity>0;

  if not exists(select 1 from public.stock_box_items where box_id=v_box.id and quantity>0) then
    raise exception 'BOX_ITEMS_NOT_PERSISTED';
  end if;

  v_result := public.tkn_v5283_close_box_to_waiting(
    v_box.box_code,v_branch,
    nullif(btrim(p_category_text),''),
    nullif(btrim(p_zone_code),''),
    nullif(btrim(p_location_text),'')
  );

  if coalesce(v_result->>'workflow_status','')<>'WAITING_STOCK'
     or nullif(v_result->>'history_id','') is null then
    raise exception 'WAITING_STOCK_NOT_CONFIRMED';
  end if;

  return v_result || jsonb_build_object(
    'box_id',v_box.id,'box_code',v_box.box_code,
    'warehouse_branch_id',v_branch,'atomic_commit',true,
    'reusable_box',true
  );
end $f$;

-- --------------------------------------------------------------------------
-- 6) Grants
-- --------------------------------------------------------------------------
revoke all on function public.tkn_v5315_get_box_context(text) from public,anon;
revoke all on function public.tkn_v5315_box_catalog(uuid,text,text,integer) from public,anon;
revoke all on function public.tkn_v5315_issue_whole_box_to_storefront(text,uuid) from public,anon;
revoke all on function public.tkn_v5309_commit_box_to_waiting(text,jsonb,text,text,text) from public,anon;

grant execute on function public.tkn_v5315_get_box_context(text) to authenticated;
grant execute on function public.tkn_v5315_box_catalog(uuid,text,text,integer) to authenticated;
grant execute on function public.tkn_v5315_issue_whole_box_to_storefront(text,uuid) to authenticated;
grant execute on function public.tkn_v5309_commit_box_to_waiting(text,jsonb,text,text,text) to authenticated;

commit;
