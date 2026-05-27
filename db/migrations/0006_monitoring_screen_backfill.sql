UPDATE users
SET allowed_screens = (
  SELECT to_jsonb(array_agg(screen ORDER BY ord))
  FROM (
    SELECT screen, ord
    FROM jsonb_array_elements_text(users.allowed_screens) WITH ORDINALITY AS existing(screen, ord)
    UNION ALL
    SELECT 'monitoring', 2147483647
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(users.allowed_screens) AS current(screen)
      WHERE current.screen = 'monitoring'
    )
  ) AS screens
)
WHERE EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(users.allowed_screens) AS current(screen)
    WHERE current.screen = 'logs'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(users.allowed_screens) AS current(screen)
    WHERE current.screen = 'monitoring'
  );
