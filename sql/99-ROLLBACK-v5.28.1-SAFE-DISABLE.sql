begin;
-- Non-destructive emergency rollback: ปิด RPC ใหม่ แต่คงตาราง/ข้อมูล audit และ import ไว้เพื่อไม่ทำข้อมูลสูญหาย
revoke execute on function public.tkn_v5281_begin_universal_batch(text,text,text,text,text,text) from authenticated;
revoke execute on function public.tkn_v5281_append_universal_items(uuid,jsonb) from authenticated;
revoke execute on function public.tkn_v5281_finalize_universal_batch(uuid) from authenticated;
revoke execute on function public.tkn_v5281_find_receiving_source(text) from authenticated;
revoke execute on function public.tkn_v5281_register_receiving_scan(uuid,text,numeric) from authenticated;
revoke execute on function public.tkn_v5281_resolve_receiving_exception(uuid,numeric,numeric,text,text,text,numeric) from authenticated;
revoke execute on function public.tkn_v5281_commit_stock_row(jsonb,jsonb) from authenticated;
commit;
-- จากนั้น Restore ไฟล์ frontend จาก backup v5.27.1; additive schema ถูกคงไว้โดยเจตนาเพื่อไม่ทำข้อมูลนำเข้าหาย
