-- Roll back both packing guard and lookup atomically, then restore the old frontend.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $guard$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.tkn_box_product_guard_v53131()')
   AND NOT prosecdef AND md5(btrim(replace(prosrc,chr(13),''),E' \t\r\n'))='01a0481b282f0a7e9cac2de85115b4ea') THEN
   RAISE EXCEPTION 'BOX_PRODUCT_GUARD_CHANGED: rollback stopped';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.stock_box_items'::regclass
   AND tgname='tkn_box_product_guard_v53131' AND tgfoid IS DISTINCT FROM to_regprocedure('public.tkn_box_product_guard_v53131()')) THEN
   RAISE EXCEPTION 'BOX_PRODUCT_TRIGGER_CONFLICT';
 END IF;
END $guard$;
DROP TRIGGER IF EXISTS tkn_box_product_guard_v53131 ON public.stock_box_items;
DROP FUNCTION public.tkn_box_product_guard_v53131();
SET LOCAL lock_timeout = '5s';
DO $guard$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_proc
   WHERE oid=to_regprocedure('public.find_product_by_barcode(text)')
   AND NOT prosecdef
   AND btrim(replace(prosrc,chr(13),''), E' \t\r\n') =
       btrim(replace($expected$DECLARE
  v_raw text := btrim(p_barcode, E' \t\r\n');
  v_sku text;
  v_ids uuid[];
BEGIN
  IF v_raw IS NULL OR v_raw = '' THEN RETURN; END IF;
  v_sku := CASE WHEN left(upper(v_raw),6) = 'TKN-P-'
                THEN substring(v_raw FROM 7) ELSE v_raw END;
  -- Keep identity case and leading zeroes. Only the QR prefix is case-insensitive.
  -- Product visibility remains controlled by the caller's existing RLS/view access.
  SELECT array_agg(DISTINCT visible.id) INTO v_ids
  FROM public.product_list visible
  WHERE visible.barcode = v_raw
     OR (v_sku <> '' AND visible.product_code = v_sku)
     OR EXISTS (
       SELECT 1 FROM public.products p
       WHERE p.id = visible.id AND p.source_barcode = v_raw
     )
     OR EXISTS (
       SELECT 1 FROM public.tkn_product_barcode_master m
       WHERE m.is_active AND m.barcode = v_raw
         AND (m.product_id = visible.id
              OR (m.product_id IS NULL AND m.internal_sku = visible.product_code))
     );
  IF coalesce(cardinality(v_ids),0) > 1 THEN
    RAISE EXCEPTION 'AMBIGUOUS_PRODUCT_CODE: %', v_raw USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT p.* FROM public.product_list p WHERE p.id = v_ids[1];
END
$expected$,chr(13),''), E' \t\r\n')) THEN
   RAISE EXCEPTION 'LOOKUP_DEFINITION_CHANGED: rollback stopped';
 END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.find_product_by_barcode(p_barcode text)
 RETURNS SETOF product_list
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select *
  from public.product_list
  where barcode = nullif(trim(p_barcode), '')
  limit 1;
$function$
;

COMMIT;
