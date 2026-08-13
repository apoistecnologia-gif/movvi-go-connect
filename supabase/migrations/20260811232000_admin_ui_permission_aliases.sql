INSERT INTO public.role_permissions (role, permission)
VALUES
  ('administrator', 'metrics.read'),
  ('administrator', 'operations.read'),
  ('administrator', 'drivers.read'),
  ('administrator', 'passengers.read'),
  ('administrator', 'rides.read'),
  ('administrator', 'pricing.read'),
  ('administrator', 'finance.read'),
  ('administrator', 'support.read'),
  ('administrator', 'roles.manage')
ON CONFLICT (role, permission) DO NOTHING;
