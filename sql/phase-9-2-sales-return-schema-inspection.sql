-- TKN POS / ERP — Phase 9.2
-- Module 2.6.1 Sales Return Schema Inspection
-- READ ONLY

-- 1) Columns
select
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'sales_returns',
    'sales_return_items',
    'sale_item_return_balance',
    'sales',
    'sale_items',
    'branch_inventory',
    'stock_documents',
    'stock_movements'
  )
order by table_name, ordinal_position;

-- 2) Foreign keys
select
  tc.table_name,
  kcu.column_name,
  ccu.table_name as foreign_table_name,
  ccu.column_name as foreign_column_name,
  tc.constraint_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
 and ccu.table_schema = tc.table_schema
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema = 'public'
  and tc.table_name in (
    'sales_returns',
    'sales_return_items',
    'sale_item_return_balance'
  )
order by tc.table_name, kcu.column_name;

-- 3) Triggers
select
  event_object_table as table_name,
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in (
    'sales_returns',
    'sales_return_items',
    'sale_items',
    'branch_inventory',
    'stock_movements'
  )
order by event_object_table, trigger_name;

-- 4) Existing return-related functions
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.proname ilike '%return%'
    or p.proname ilike '%refund%'
  )
order by p.proname;

-- 5) Sample rows
select * from public.sales_returns limit 5;
select * from public.sales_return_items limit 5;
select * from public.sale_item_return_balance limit 10;
