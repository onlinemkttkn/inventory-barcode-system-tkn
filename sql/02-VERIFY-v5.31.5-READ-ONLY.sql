-- TKN v5.31.5 — VERIFY READ ONLY

select * from (
  values
    ('whole box audit table',case when to_regclass('public.tkn_v5315_whole_box_issue_audit') is not null then 'PASS' else 'FAIL' end),
    ('context rpc',case when to_regprocedure('public.tkn_v5315_get_box_context(text)') is not null then 'PASS' else 'FAIL' end),
    ('catalog rpc',case when to_regprocedure('public.tkn_v5315_box_catalog(uuid,text,text,integer)') is not null then 'PASS' else 'FAIL' end),
    ('whole box issue rpc',case when to_regprocedure('public.tkn_v5315_issue_whole_box_to_storefront(text,uuid)') is not null then 'PASS' else 'FAIL' end),
    ('reusable sorting rpc',case when to_regprocedure('public.tkn_v5309_commit_box_to_waiting(text,jsonb,text,text,text)') is not null then 'PASS' else 'FAIL' end)
) x(check_name,result)
order by check_name;

select p.proname function_name,pg_get_function_identity_arguments(p.oid) arguments,p.prosecdef security_definer
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in('tkn_v5315_get_box_context','tkn_v5315_box_catalog',
                   'tkn_v5315_issue_whole_box_to_storefront','tkn_v5309_commit_box_to_waiting')
order by p.proname,arguments;

select * from (
  values
    ('anon context',has_function_privilege('anon','public.tkn_v5315_get_box_context(text)','EXECUTE')),
    ('anon catalog',has_function_privilege('anon','public.tkn_v5315_box_catalog(uuid,text,text,integer)','EXECUTE')),
    ('anon whole box issue',has_function_privilege('anon','public.tkn_v5315_issue_whole_box_to_storefront(text,uuid)','EXECUTE')),
    ('authenticated context',has_function_privilege('authenticated','public.tkn_v5315_get_box_context(text)','EXECUTE')),
    ('authenticated catalog',has_function_privilege('authenticated','public.tkn_v5315_box_catalog(uuid,text,text,integer)','EXECUTE')),
    ('authenticated whole box issue',has_function_privilege('authenticated','public.tkn_v5315_issue_whole_box_to_storefront(text,uuid)','EXECUTE'))
) x(check_name,can_execute)
order by check_name;

-- Audit ล่าสุด ถ้ายังไม่เคยเบิกจะได้ 0 แถวเป็นปกติ
select box_code,branch_id,category_text,box_items_snapshot,issued_by,issued_at
from public.tkn_v5315_whole_box_issue_audit
order by issued_at desc
limit 20;
