-- ============================================================
-- TKN v5.26.1 DB-SAFE — READ-ONLY PREFLIGHT
-- ไฟล์นี้มีเฉพาะ SELECT และไม่เปลี่ยน Schema / ข้อมูล / Policy / Trigger
-- รันก่อนติดตั้ง ต้องได้ PASS ทุกแถว หากมี STOP ห้ามรันไฟล์ INSTALL
-- ============================================================

with required_tables(name) as (
  values
    ('stock_boxes'),('stock_box_items'),('branches'),('branch_inventory'),
    ('transfer_documents'),('transfer_items'),('sales'),('sale_items'),('products'),
    ('app_roles'),('app_permissions'),('app_role_permissions')
),
required_columns(table_name,column_name) as (
  values
    ('stock_boxes','id'),('stock_boxes','box_code'),('stock_boxes','status'),
    ('stock_boxes','location_text'),('stock_boxes','closed_at'),
    ('stock_box_items','box_id'),('stock_box_items','product_id'),
    ('stock_box_items','sku'),('stock_box_items','quantity'),
    ('branches','id'),('branches','code'),('branches','name'),('branches','is_active'),
    ('branch_inventory','branch_id'),('branch_inventory','product_id'),('branch_inventory','quantity'),
    ('transfer_documents','id'),('transfer_documents','transfer_no'),
    ('transfer_documents','source_branch_id'),('transfer_documents','destination_branch_id'),
    ('transfer_documents','status'),('transfer_documents','sent_at'),
    ('transfer_items','transfer_id'),('transfer_items','product_id'),
    ('transfer_items','quantity_sent'),('transfer_items','quantity_received'),
    ('sales','id'),('sales','sale_no'),('sales','branch_id'),('sales','status'),
    ('sales','net_total'),('sales','received_amount'),('sales','change_amount'),
    ('sale_items','sale_id'),('sale_items','product_id'),('sale_items','quantity'),('sale_items','line_total'),
    ('products','id'),('products','product_code'),('products','barcode'),('products','name'),
    ('products','lot_code'),('products','cost_price'),('products','selling_price'),('products','is_active')
),
checks(check_name,passed,detail) as (
  select 'table: '||name,
         to_regclass('public.'||name) is not null,
         coalesce(to_regclass('public.'||name)::text,'missing')
  from required_tables

  union all

  select 'column: '||table_name||'.'||column_name,
         exists(
           select 1 from information_schema.columns c
           where c.table_schema='public'
             and c.table_name=required_columns.table_name
             and c.column_name=required_columns.column_name
         ),
         'required by v5.26.1'
  from required_columns

  union all

  select * from (values
    ('function: current_access_context',
      to_regprocedure('public.current_access_context()') is not null,
      coalesce(to_regprocedure('public.current_access_context()')::text,'missing')),
    ('function: create_branch_transfer',
      to_regprocedure('public.create_branch_transfer(uuid,uuid,jsonb,text,text)') is not null,
      coalesce(to_regprocedure('public.create_branch_transfer(uuid,uuid,jsonb,text,text)')::text,'missing')),
    ('function: receive_branch_transfer',
      to_regprocedure('public.receive_branch_transfer(uuid)') is not null,
      coalesce(to_regprocedure('public.receive_branch_transfer(uuid)')::text,'missing')),
    ('function: create_pos_sale',
      to_regprocedure('public.create_pos_sale(uuid,jsonb,numeric,text,numeric,text,text,text)') is not null,
      coalesce(to_regprocedure('public.create_pos_sale(uuid,jsonb,numeric,text,numeric,text,text,text)')::text,'missing')),
    ('function: is_active_user',
      to_regprocedure('public.is_active_user()') is not null,
      coalesce(to_regprocedure('public.is_active_user()')::text,'missing')),
    ('required sale roles exist',
      not exists(
        select required.code
        from (values ('owner'),('admin'),('manager'),('secretary'),('supervisor')) required(code)
        where not exists(select 1 from public.app_roles r where r.code=required.code)
      ),
      'owner/admin/manager/secretary/supervisor'),
    ('required inventory permissions exist',
      not exists(
        select required.code
        from (values ('inventory.view'),('inventory.issue'),('inventory.transfer'),('inventory.receive'),('product.manage')) required(code)
        where not exists(select 1 from public.app_permissions p where p.code=required.code)
      ),
      'inventory.view/issue/transfer/receive and product.manage'),
    ('active branch exists',
      exists(select 1 from public.branches where is_active=true),
      'at least one active branch'),
    ('unsafe v5.26.0 core triggers absent',
      not exists(
        select 1
        from pg_trigger t
        join pg_class c on c.oid=t.tgrelid
        join pg_namespace n on n.oid=c.relnamespace
        where not t.tgisinternal
          and n.nspname='public'
          and c.relname in ('stock_boxes','stock_box_items','sales','sale_items','transfer_documents')
          and t.tgname in (
            'trg_tkn_guard_box_header_mutation',
            'trg_tkn_guard_in_transit_box_items',
            'trg_tkn_guard_linked_box_transfer_status',
            'trg_tkn_sale_item_storefront_sync',
            'trg_tkn_void_sale_storefront_restore',
            'trg_tkn_box_item_storefront_sync'
          )
      ),
      'ถ้า STOP แสดงว่าเคยรัน Patch v5.26.0 รุ่นเดิม ห้ามติดตั้งทับ')
  ) as fixed(check_name,passed,detail)
)
select case when passed then 'PASS' else 'STOP' end as result,
       check_name,
       detail
from checks
order by passed,check_name;

-- BASELINE: เก็บผลชุดนี้ไว้เทียบกับไฟล์ 02-VERIFY หลังติดตั้ง
select
  (select count(*) from public.stock_boxes) as existing_boxes,
  (select count(*) from public.stock_box_items) as existing_box_items,
  (select count(*) from public.sales) as existing_sales,
  (select count(*) from public.sale_items) as existing_sale_items,
  (select count(*) from public.branch_inventory) as existing_branch_inventory_rows,
  (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and n.nspname='public'
      and c.relname in ('stock_boxes','stock_box_items','sales','sale_items','branch_inventory','transfer_documents','transfer_items'))
    as existing_core_triggers;
