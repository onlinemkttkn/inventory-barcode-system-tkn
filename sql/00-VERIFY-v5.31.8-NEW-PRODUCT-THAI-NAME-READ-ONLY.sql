-- TKN v5.31.8 — READ ONLY verification after UAT
-- ไม่มี INSERT / UPDATE / DELETE / DDL
select
  p.product_code,
  p.name,
  p.created_at,
  case when p.name ~ '[ก-๙]' then 'THAI_OK' else 'CHECK_NAME' end as thai_name_status
from public.products p
where p.created_at >= now() - interval '1 day'
order by p.created_at desc
limit 100;
