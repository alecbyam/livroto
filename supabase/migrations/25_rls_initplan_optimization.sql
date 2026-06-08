-- Perf RLS : auth.uid() était ré-évalué par ligne. On l'enveloppe en (select auth.uid())
-- pour qu'il soit évalué une seule fois par requête. ALTER POLICY ne change que l'expression
-- (rôles/commande préservés) -> sémantiquement identique, juste plus rapide à grande échelle.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT format('ALTER POLICY %I ON %I.%I%s%s',
      policyname, schemaname, tablename,
      CASE WHEN qual IS NOT NULL
        THEN ' USING ('|| replace(qual, 'auth.uid()', '(select auth.uid())') ||')' ELSE '' END,
      CASE WHEN with_check IS NOT NULL
        THEN ' WITH CHECK ('|| replace(with_check, 'auth.uid()', '(select auth.uid())') ||')' ELSE '' END
    ) AS stmt
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual LIKE '%auth.uid()%' OR with_check LIKE '%auth.uid()%')
  LOOP
    EXECUTE r.stmt;
  END LOOP;
END $$;
