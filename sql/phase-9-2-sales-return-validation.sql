-- Phase 9.2 Module 2.6.2 Validation
-- Replace RETURN_NO and SALE_UUID before running.

-- 1. Return header
select *
from public.sales_returns
where return_no = 'RETURN_NO';

-- 2. Return lines
select sri.*
from public.sales_return_items sri
join public.sales_returns sr
  on sr.id = sri.return_id
where sr.return_no = 'RETURN_NO';

-- 3. Sale status
select
  id,
  sale_no,
  status,
  notes
from public.sales
where id = 'SALE_UUID';

-- 4. Return balance
select *
from public.sale_item_return_balance
where sale_id = 'SALE_UUID';

-- 5. Stock document
select *
from public.stock_documents
where reference_no = 'RETURN_NO';

-- 6. Stock movements
select sm.*
from public.stock_movements sm
join public.stock_documents sd
  on sd.id = sm.document_id
where sd.reference_no = 'RETURN_NO'
order by sm.created_at;

-- 7. Current branch inventory
select
  bi.branch_id,
  bi.product_id,
  bi.quantity,
  bi.updated_at
from public.branch_inventory bi
where bi.branch_id = (
  select branch_id
  from public.sales
  where id = 'SALE_UUID'
)
and bi.product_id in (
  select product_id
  from public.sale_items
  where sale_id = 'SALE_UUID'
);
