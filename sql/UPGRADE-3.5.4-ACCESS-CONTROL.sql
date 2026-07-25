-- TKN POS / ERP Master 3.5.4 Access Control Stable
-- Additive upgrade: no table/column/data deletion.
begin;

create or replace function public.admin_set_user_role_safe(
  p_user_id uuid,
  p_role_code text,
  p_branch_id uuid default null,
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role_id uuid;
  v_actor_role text;
  v_target_current_role text;
  v_profile_enum_supported boolean := false;
  v_profile_fallback text := 'staff';
begin
  if not public.user_has_permission('user.manage'::text,auth.uid()) then
    raise exception 'ไม่มีสิทธิ์จัดการผู้ใช้';
  end if;

  select id into v_role_id
  from public.app_roles
  where code=p_role_code and is_active=true;
  if v_role_id is null then raise exception 'ไม่พบ Role ที่ระบุ'; end if;

  select current_access_context()->>'role' into v_actor_role;
  select r.code into v_target_current_role
  from public.app_user_roles ur
  join public.app_roles r on r.id=ur.role_id
  where ur.user_id=p_user_id and ur.is_active=true
  order by r.sort_order,r.code limit 1;

  if p_role_code='owner' and v_actor_role<>'owner' then
    raise exception 'เฉพาะ Owner เท่านั้นที่กำหนด Owner ได้';
  end if;
  if v_target_current_role='owner' and v_actor_role<>'owner' then
    raise exception 'เฉพาะ Owner เท่านั้นที่แก้ไขบัญชี Owner ได้';
  end if;

  delete from public.app_user_roles where user_id=p_user_id;
  insert into public.app_user_roles(user_id,role_id,is_active,assigned_at)
  values(p_user_id,v_role_id,p_is_active,now());

  -- profiles.role is legacy compatibility only. The authoritative role is app_user_roles.
  select exists(
    select 1 from pg_type t
    join pg_enum e on e.enumtypid=t.oid
    where t.typname='app_role' and e.enumlabel=p_role_code
  ) into v_profile_enum_supported;

  if v_profile_enum_supported then
    execute 'update public.profiles set role=$1::public.app_role,is_active=$2 where id=$3'
      using p_role_code,p_is_active,p_user_id;
  else
    select case
      when p_role_code in ('secretary','accounting','purchasing','warehouse') then 'staff'
      when p_role_code in ('manager','supervisor','cashier','staff') then p_role_code
      else 'staff'
    end into v_profile_fallback;

    select exists(
      select 1 from pg_type t
      join pg_enum e on e.enumtypid=t.oid
      where t.typname='app_role' and e.enumlabel=v_profile_fallback
    ) into v_profile_enum_supported;

    if v_profile_enum_supported then
      execute 'update public.profiles set role=$1::public.app_role,is_active=$2 where id=$3'
        using v_profile_fallback,p_is_active,p_user_id;
    else
      update public.profiles set is_active=p_is_active where id=p_user_id;
    end if;
  end if;

  insert into public.app_action_logs(action,entity_type,entity_id,branch_id,details,created_by)
  values('USER_ROLE_SET','USER',p_user_id::text,p_branch_id,
    jsonb_build_object('role',p_role_code,'active',p_is_active),auth.uid());

  return jsonb_build_object('success',true,'user_id',p_user_id,'role',p_role_code);
end;
$$;
revoke all on function public.admin_set_user_role_safe(uuid,text,uuid,boolean) from public;
grant execute on function public.admin_set_user_role_safe(uuid,text,uuid,boolean) to authenticated;

create or replace function public.admin_set_role_permissions(
  p_role_code text,
  p_permission_codes text[] default array[]::text[]
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role_id uuid;
  v_actor_role text;
  v_count integer;
begin
  if not public.user_has_permission('permission.manage'::text,auth.uid()) then
    raise exception 'ไม่มีสิทธิ์จัดการ Permission';
  end if;

  select current_access_context()->>'role' into v_actor_role;
  if p_role_code='owner' and v_actor_role<>'owner' then
    raise exception 'เฉพาะ Owner เท่านั้นที่แก้สิทธิ์ Owner ได้';
  end if;

  select id into v_role_id from public.app_roles where code=p_role_code and is_active=true;
  if v_role_id is null then raise exception 'ไม่พบ Role ที่ระบุ'; end if;

  if exists(
    select 1 from unnest(coalesce(p_permission_codes,array[]::text[])) code
    left join public.app_permissions p on p.code=code
    where p.id is null
  ) then
    raise exception 'พบ Permission ที่ไม่มีในระบบ';
  end if;

  delete from public.app_role_permissions where role_id=v_role_id;
  insert into public.app_role_permissions(role_id,permission_id)
  select v_role_id,p.id
  from public.app_permissions p
  where p.code=any(coalesce(p_permission_codes,array[]::text[]));

  get diagnostics v_count=row_count;
  insert into public.app_action_logs(action,entity_type,entity_id,details,created_by)
  values('ROLE_PERMISSIONS_SET','ROLE',p_role_code,
    jsonb_build_object('permission_codes',coalesce(p_permission_codes,array[]::text[]),'count',v_count),auth.uid());

  return jsonb_build_object('success',true,'role',p_role_code,'permission_count',v_count);
end;
$$;
revoke all on function public.admin_set_role_permissions(text,text[]) from public;
grant execute on function public.admin_set_role_permissions(text,text[]) to authenticated;

commit;
