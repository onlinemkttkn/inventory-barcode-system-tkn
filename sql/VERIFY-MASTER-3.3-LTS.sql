-- MASTER 3.3 LTS verification
select id,code,name_th,landing_page,sort_order,is_active
from public.app_roles
where code in (
 'owner','admin','secretary','manager','supervisor',
 'cashier','warehouse','purchasing','accounting','staff'
)
order by sort_order;

select
  r.code as role_code,
  count(*) as permission_count
from public.app_roles r
left join public.app_role_permissions rp on rp.role_id=r.id
where r.code in (
 'owner','admin','secretary','manager','supervisor',
 'cashier','warehouse','purchasing','accounting','staff'
)
group by r.code,r.sort_order
order by r.sort_order;

select
  p.oid::regprocedure::text as function_signature,
  pg_get_function_result(p.oid) as return_type
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'user_has_permission',
    'current_access_context',
    'admin_list_users',
    'admin_set_user_role',
    'void_sale_phase_9_2',
    'set_branch_product_stock',
    'get_sales_control_dashboard_v2_1'
  )
order by p.proname,function_signature;

select public.current_access_context() as current_access;
