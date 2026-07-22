select
  p.oid::regprocedure as function_signature,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'void_sale_phase_9_2';

-- Expected frontend call:
-- supabaseClient.rpc('void_sale_phase_9_2', {
--   p_sale_id: '<SALE UUID>',
--   p_reason: 'เหตุผลอย่างน้อย 5 ตัวอักษร'
-- });
