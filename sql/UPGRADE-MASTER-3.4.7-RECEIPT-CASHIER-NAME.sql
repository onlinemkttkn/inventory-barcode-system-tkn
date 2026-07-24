-- Master 3.4.7: use Admin-managed cashier display name on receipts
create or replace view public.pos_receipt_header
with (security_invoker=true)
as
select
  s.id,
  s.sale_no,
  s.branch_id,
  b.code as branch_code,
  b.name as branch_name,
  b.address as branch_address,
  b.phone as branch_phone,
  s.status,
  s.subtotal,
  s.discount_amount,
  s.net_total,
  s.payment_method,
  s.received_amount,
  s.change_amount,
  s.customer_name,
  s.customer_phone,
  s.member_id,
  m.member_no,
  m.full_name as member_name,
  m.phone as member_phone,
  s.points_earned,
  s.points_redeemed,
  s.notes,
  s.created_at,
  coalesce(nullif(cp.display_name,''),p.full_name,p.email) as cashier_name,
  p.email as cashier_email,
  cp.employee_code as cashier_employee_code
from public.sales s
join public.branches b on b.id=s.branch_id
left join public.members m on m.id=s.member_id
left join public.profiles p on p.id=s.created_by
left join public.cashier_profiles cp on cp.user_id=s.created_by;

grant select on public.pos_receipt_header to authenticated;
