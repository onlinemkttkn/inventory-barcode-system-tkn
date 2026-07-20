-- TKN POS / ERP — Phase 9.2
-- Role & Permission Foundation for PostgreSQL / Supabase
-- Additive migration. Review names before running in production.

begin;

create table if not exists public.app_roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_th text not null,
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.app_permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  module text not null,
  name_th text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.app_role_permissions (
  role_id uuid not null references public.app_roles(id) on delete cascade,
  permission_id uuid not null references public.app_permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table if not exists public.app_user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.app_roles(id) on delete restrict,
  is_active boolean not null default true,
  assigned_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

insert into public.app_roles (code, name_th)
values
  ('cashier', 'แคชเชียร์'),
  ('supervisor', 'หัวหน้าหน้าร้าน'),
  ('accounting', 'บัญชี'),
  ('warehouse', 'คลังสินค้า'),
  ('sales', 'ฝ่ายขาย'),
  ('owner', 'ผู้บริหาร')
on conflict (code) do update set name_th = excluded.name_th;

insert into public.app_permissions (code, module, name_th)
values
  ('pos.sell', 'pos', 'ขายสินค้า'),
  ('pos.hold_bill', 'pos', 'พักบิล'),
  ('pos.search_bill', 'pos', 'ค้นหาบิลย้อนหลัง'),
  ('pos.reprint_receipt', 'pos', 'พิมพ์ใบเสร็จซ้ำ'),
  ('pos.discount_request', 'pos', 'ขอส่วนลด'),
  ('pos.discount_approve', 'pos', 'อนุมัติส่วนลด'),
  ('pos.void_bill', 'pos', 'ยกเลิกบิล'),
  ('pos.return_create', 'pos', 'สร้างรายการคืนสินค้า'),
  ('pos.return_approve', 'pos', 'อนุมัติคืนสินค้า'),
  ('payment.receive_cash', 'payment', 'รับเงินสด'),
  ('payment.receive_qr', 'payment', 'รับชำระ QR'),
  ('payment.receive_transfer', 'payment', 'รับเงินโอน'),
  ('payment.split', 'payment', 'รับชำระหลายช่องทาง'),
  ('accounting.slip_review', 'accounting', 'ตรวจสอบสลิป'),
  ('accounting.reconcile', 'accounting', 'กระทบยอด'),
  ('accounting.daily_close', 'accounting', 'ปิดรอบรายวัน'),
  ('accounting.monthly_close', 'accounting', 'ปิดรอบรายเดือน'),
  ('accounting.export', 'accounting', 'ส่งออกข้อมูลบัญชี'),
  ('inventory.receive', 'inventory', 'รับสินค้า'),
  ('inventory.issue', 'inventory', 'เบิกสินค้า'),
  ('inventory.transfer', 'inventory', 'โอนสินค้า'),
  ('inventory.count', 'inventory', 'ตรวจนับสินค้า'),
  ('inventory.adjust', 'inventory', 'ปรับยอดสต็อก'),
  ('customer.view', 'customer', 'ดูข้อมูลลูกค้า'),
  ('customer.edit', 'customer', 'แก้ไขข้อมูลลูกค้า'),
  ('customer.export', 'customer', 'ส่งออกข้อมูลลูกค้า'),
  ('dashboard.view', 'dashboard', 'ดูแดชบอร์ด'),
  ('dashboard.drilldown', 'dashboard', 'เจาะลึกรายละเอียด'),
  ('report.export', 'report', 'ส่งออกรายงาน'),
  ('user.manage', 'admin', 'จัดการผู้ใช้'),
  ('permission.manage', 'admin', 'จัดการสิทธิ์'),
  ('audit.view', 'audit', 'ดูประวัติการทำรายการ')
on conflict (code) do update
set module = excluded.module,
    name_th = excluded.name_th;

-- Helper function for server-side permission checks.
create or replace function public.user_has_permission(
  requested_permission text,
  requested_user uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_user_roles ur
    join public.app_role_permissions rp on rp.role_id = ur.role_id
    join public.app_permissions p on p.id = rp.permission_id
    where ur.user_id = requested_user
      and ur.is_active = true
      and p.code = requested_permission
  );
$$;

revoke all on function public.user_has_permission(text, uuid) from public;
grant execute on function public.user_has_permission(text, uuid) to authenticated;

alter table public.app_roles enable row level security;
alter table public.app_permissions enable row level security;
alter table public.app_role_permissions enable row level security;
alter table public.app_user_roles enable row level security;

drop policy if exists "authenticated can read roles" on public.app_roles;
create policy "authenticated can read roles"
on public.app_roles for select
to authenticated
using (true);

drop policy if exists "authenticated can read permissions" on public.app_permissions;
create policy "authenticated can read permissions"
on public.app_permissions for select
to authenticated
using (true);

drop policy if exists "user can read own roles" on public.app_user_roles;
create policy "user can read own roles"
on public.app_user_roles for select
to authenticated
using (user_id = auth.uid() or public.user_has_permission('user.manage'));

commit;
