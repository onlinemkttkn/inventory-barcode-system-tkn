-- TKN POS / ERP — Phase 9.2 Return Popup Safe Upgrade v2.1
-- Fix: invalid input value for enum sale_status: "PARTIAL_RETURN"
--
-- Safe characteristics:
-- - Does not delete or modify existing rows.
-- - Adds only missing enum values.
-- - Can be run repeatedly.

alter type public.sale_status
  add value if not exists 'PARTIAL_RETURN';

alter type public.sale_status
  add value if not exists 'RETURNED';

-- Verification
select
  e.enumlabel as sale_status
from pg_type t
join pg_enum e
  on e.enumtypid = t.oid
join pg_namespace n
  on n.oid = t.typnamespace
where n.nspname = 'public'
  and t.typname = 'sale_status'
order by e.enumsortorder;


-- Verify that the return-balance view exposes the fields required by UI v2.2.
select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'sale_item_return_balance'
  and column_name in (
    'sale_id',
    'sale_item_id',
    'sold_quantity',
    'returned_quantity',
    'returnable_quantity',
    'unit_price',
    'product_name'
  )
order by ordinal_position;
