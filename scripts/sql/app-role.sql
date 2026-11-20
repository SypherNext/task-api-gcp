-- Run in Cloud SQL Studio as postgres, connected to database "tasks", after app/schema.sql.
-- The runtime login task_app (created by scripts/03-app-login-and-secret.sh) gets only
-- this role: CRUD on the tasks table, no ownership, no CREATE, not cloudsqlsuperuser.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'task_app_role') THEN
    CREATE ROLE task_app_role NOLOGIN;
  END IF;
END $$;
GRANT CONNECT ON DATABASE tasks TO task_app_role;
GRANT USAGE ON SCHEMA public TO task_app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tasks TO task_app_role;
