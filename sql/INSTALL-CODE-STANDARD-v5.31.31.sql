-- QR/barcode lookup and pre-packing validation, one atomic transaction.
-- Target project wkozeuxyhqcmiatssviq. No existing product/box rows rewritten.
BEGIN;
-- Target project: wkozeuxyhqcmiatssviq. No product data or identifiers are rewritten.
-- Retains the existing RPC signature, return type, ownership and grants.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $guard$
DECLARE v_body text; v_definer boolean; v_volatility "char";
BEGIN
 SELECT prosrc,prosecdef,provolatile INTO v_body,v_definer,v_volatility
 FROM pg_proc WHERE oid=to_regprocedure('public.find_product_by_barcode(text)');
 IF NOT FOUND THEN RAISE EXCEPTION 'LOOKUP_FUNCTION_MISSING'; END IF;
 IF v_definer OR v_volatility <> 's' OR
    btrim(replace(v_body,chr(13),''), E' \t\r\n') NOT IN (
      btrim(replace($old$
  select *
  from public.product_list
  where barcode = nullif(trim(p_barcode), '')
  limit 1;
$old$,chr(13),''), E' \t\r\n'),
      btrim(replace($new$DECLARE
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
$new$,chr(13),''), E' \t\r\n')
    ) THEN RAISE EXCEPTION 'LOOKUP_DEFINITION_CHANGED: re-audit before applying'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.find_product_by_barcode(p_barcode text)
RETURNS SETOF public.product_list
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO ''
AS $body$
DECLARE
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
$body$;

-- Install after 2026-09-16-product-code-lookup-patch.sql.
-- Validates NEW packing writes only; does not rewrite existing boxes/history.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $preflight$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc
    WHERE oid=to_regprocedure('public.tkn_box_product_guard_v53131()')
      AND (prosecdef OR md5(btrim(replace(prosrc,chr(13),''),E' \t\r\n')) <> '01a0481b282f0a7e9cac2de85115b4ea')) THEN
    RAISE EXCEPTION 'BOX_PRODUCT_GUARD_CHANGED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc
    WHERE oid=to_regprocedure('public.find_product_by_barcode(text)')
      AND NOT prosecdef
      AND md5(btrim(replace(prosrc,chr(13),''),E' \t\r\n')) = 'dcdf88add36df0a0fdc2b2ef5668f541') THEN
    RAISE EXCEPTION 'INSTALL_PRODUCT_LOOKUP_PATCH_FIRST';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.stock_box_items'::regclass
    AND tgname='tkn_box_product_guard_v53131'
    AND tgfoid IS DISTINCT FROM to_regprocedure('public.tkn_box_product_guard_v53131()')) THEN
    RAISE EXCEPTION 'BOX_PRODUCT_TRIGGER_CONFLICT';
  END IF;
END $preflight$;

CREATE OR REPLACE FUNCTION public.tkn_box_product_guard_v53131()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $guard$
DECLARE
  v_product public.product_list%rowtype;
BEGIN
  -- Removing existing contents remains possible after a product is disabled.
  IF TG_OP='UPDATE' THEN
    IF NEW.product_id IS NOT DISTINCT FROM OLD.product_id
       AND NEW.sku IS NOT DISTINCT FROM OLD.sku
       AND NEW.box_id IS NOT DISTINCT FROM OLD.box_id
       AND NEW.quantity <= OLD.quantity THEN RETURN NEW; END IF;
  END IF;
  IF upper(btrim(NEW.sku,E' \t\r\n')) LIKE 'TKN-B-%' THEN
    RAISE EXCEPTION 'BOX_QR_NOT_PRODUCT';
  END IF;
  SELECT * INTO v_product FROM public.find_product_by_barcode(NEW.sku);
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
  IF NEW.product_id IS NOT NULL AND NEW.product_id <> v_product.id THEN
    RAISE EXCEPTION 'PRODUCT_CODE_MISMATCH';
  END IF;
  IF v_product.is_active IS NOT TRUE THEN RAISE EXCEPTION 'PRODUCT_INACTIVE'; END IF;
  IF nullif(btrim(v_product.product_code),'') IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_CODE_REQUIRED';
  END IF;
  NEW.product_id := v_product.id;
  NEW.sku := v_product.product_code;
  RETURN NEW;
END $guard$;

CREATE OR REPLACE TRIGGER tkn_box_product_guard_v53131
BEFORE INSERT OR UPDATE ON public.stock_box_items
FOR EACH ROW EXECUTE FUNCTION public.tkn_box_product_guard_v53131();

COMMIT;
