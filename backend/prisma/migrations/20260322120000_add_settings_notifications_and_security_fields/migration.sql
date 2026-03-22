ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "notify_new_inbound" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notify_reminder_due" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notify_daily_digest_hour" INTEGER,
  ADD COLUMN IF NOT EXISTS "security_last_password_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "security_last_login_at" TIMESTAMP(3);
