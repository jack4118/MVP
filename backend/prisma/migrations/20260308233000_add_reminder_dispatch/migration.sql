-- Alter reminders for dispatch tracking
ALTER TABLE "reminders"
  ADD COLUMN "last_dispatched_at" TIMESTAMP(3),
  ADD COLUMN "next_dispatch_at" TIMESTAMP(3);

-- Create reminder dispatch logs
CREATE TABLE "reminder_dispatch_logs" (
  "id" TEXT NOT NULL,
  "reminder_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "dispatch_key" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "error" TEXT,
  "payload" JSONB,
  "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reminder_dispatch_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reminder_dispatch_logs_dispatch_key_key" ON "reminder_dispatch_logs"("dispatch_key");
CREATE INDEX "reminder_dispatch_logs_user_id_idx" ON "reminder_dispatch_logs"("user_id");
CREATE INDEX "reminder_dispatch_logs_reminder_id_idx" ON "reminder_dispatch_logs"("reminder_id");
CREATE INDEX "reminder_dispatch_logs_status_idx" ON "reminder_dispatch_logs"("status");
CREATE INDEX "reminder_dispatch_logs_sent_at_idx" ON "reminder_dispatch_logs"("sent_at");

ALTER TABLE "reminder_dispatch_logs"
  ADD CONSTRAINT "reminder_dispatch_logs_reminder_id_fkey" FOREIGN KEY ("reminder_id") REFERENCES "reminders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reminder_dispatch_logs"
  ADD CONSTRAINT "reminder_dispatch_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
