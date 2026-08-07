-- ปลอดภัยต่อข้อมูล: ปิดเฉพาะ API v5.27.1 และคงตาราง/ข้อมูลชุดงานไว้
begin;
drop function if exists public.tkn_v5271_begin_import_batch(text,text,text,text);
drop function if exists public.tkn_v5271_append_import_items(uuid,jsonb);
drop function if exists public.tkn_v5271_finalize_import_batch(uuid);
drop function if exists public.tkn_v5271_find_sorting_source(text,text);
drop function if exists public.tkn_v5271_sync_sorting_progress(jsonb,boolean);
commit;
