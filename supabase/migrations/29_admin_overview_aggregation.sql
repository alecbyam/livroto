-- =========================================================
-- Agrégation SQL pour les tableaux de bord admin (scalabilité)
-- Remplace l'agrégation faite côté Node (fetch de toutes les commandes
-- 30j + boucle JS) par des requêtes agrégées côté Postgres. Le volume de
-- lignes transférées ne dépend plus du nombre de commandes, seulement du
-- résultat agrégé (quelques lignes/jour, quelques zones).
-- Appelées uniquement via le client service_role (assertAdmin déjà fait
-- côté serveur) — EXECUTE révoqué pour anon/authenticated en défense en
-- profondeur.
-- =========================================================

-- ---------- Commandes/revenus par jour (admin global ou 1 vendeur) ----------
CREATE OR REPLACE FUNCTION public.admin_daily_order_stats(p_days int, p_vendor_id uuid DEFAULT NULL)
RETURNS TABLE (day date, commandes bigint, revenus numeric)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT
    d::date AS day,
    COUNT(o.id) AS commandes,
    COALESCE(SUM(o.total_usd) FILTER (WHERE o.status = 'delivered'), 0) AS revenus
  FROM generate_series(
    (now() AT TIME ZONE 'utc')::date - (p_days - 1),
    (now() AT TIME ZONE 'utc')::date,
    interval '1 day'
  ) AS d
  LEFT JOIN public.orders o
    ON (o.created_at AT TIME ZONE 'utc')::date = d::date
    AND (p_vendor_id IS NULL OR o.vendor_id = p_vendor_id)
  GROUP BY d
  ORDER BY d;
$$;

REVOKE ALL ON FUNCTION public.admin_daily_order_stats(int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_daily_order_stats(int, uuid) TO service_role;

-- ---------- Vue d'ensemble admin (pilotage quotidien) ----------
-- Bunia/Ituri = UTC+2 fixe (pas de DST) ; reproduit exactement le calcul
-- de journée locale précédemment fait en JS (startOfLocalDayUtc).
CREATE OR REPLACE FUNCTION public.admin_overview_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_now timestamptz := now();
  v_start_today timestamptz := date_trunc('day', v_now + interval '2 hours') - interval '2 hours';
  v_start_yesterday timestamptz := v_start_today - interval '1 day';
  v_since7 timestamptz := v_now - interval '7 days';
  v_since30 timestamptz := v_now - interval '30 days';
  v_today_orders bigint; v_today_revenue numeric;
  v_yesterday_orders bigint;
  v_week_orders bigint; v_week_revenue numeric; v_week_delivered bigint;
  v_trend numeric;
  v_hot_zones jsonb;
  v_cash numeric;
BEGIN
  SELECT count(*), COALESCE(SUM(total_usd) FILTER (WHERE status = 'delivered'), 0)
    INTO v_today_orders, v_today_revenue
    FROM public.orders WHERE created_at >= v_start_today;

  SELECT count(*) INTO v_yesterday_orders
    FROM public.orders WHERE created_at >= v_start_yesterday AND created_at < v_start_today;

  SELECT count(*), COALESCE(SUM(total_usd) FILTER (WHERE status = 'delivered'), 0),
         count(*) FILTER (WHERE status = 'delivered')
    INTO v_week_orders, v_week_revenue, v_week_delivered
    FROM public.orders WHERE created_at >= v_since7;

  v_trend := CASE
    WHEN v_yesterday_orders = 0 THEN (CASE WHEN v_today_orders > 0 THEN 100 ELSE 0 END)
    ELSE round(((v_today_orders - v_yesterday_orders)::numeric / v_yesterday_orders) * 100)
  END;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('zone', zone, 'orders', orders, 'revenue', revenue)), '[]'::jsonb)
    INTO v_hot_zones
  FROM (
    SELECT COALESCE(zone, '—') AS zone, count(*) AS orders,
           COALESCE(SUM(total_usd) FILTER (WHERE status = 'delivered'), 0) AS revenue
    FROM public.orders
    WHERE created_at >= v_since7
    GROUP BY zone
    ORDER BY count(*) DESC
    LIMIT 6
  ) z;

  SELECT COALESCE(SUM(total_usd), 0) INTO v_cash
    FROM public.orders
    WHERE created_at >= v_since30 AND status = 'delivered' AND payment_status <> 'paid';

  RETURN jsonb_build_object(
    'today', jsonb_build_object('orders', v_today_orders, 'revenue', v_today_revenue, 'trendOrders', v_trend),
    'week', jsonb_build_object(
      'orders', v_week_orders, 'revenue', v_week_revenue,
      'avgBasket', CASE WHEN v_week_delivered > 0 THEN v_week_revenue / v_week_delivered ELSE 0 END
    ),
    'cashToCollect', v_cash,
    'hotZones', v_hot_zones
  );
END $$;

REVOKE ALL ON FUNCTION public.admin_overview_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_overview_stats() TO service_role;
