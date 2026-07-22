-- Run after MASTER-3.2-COMPLETE.sql
select code,name_th,landing_page
from public.tkn_roles
order by sort_order;

select
  public.current_access_context() as current_user_access;

select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
   'current_access_context',
   'user_has_permission',
   'admin_list_users',
   'admin_set_user_role',
   'set_branch_product_stock',
   'void_sale_phase_9_2',
   'get_sales_control_dashboard_v2_1'
  )
order by p.proname;
