ALTER TABLE "leads"
ADD COLUMN "last_inbound_at" TIMESTAMP(3),
ADD COLUMN "last_outbound_at" TIMESTAMP(3),
ADD COLUMN "next_follow_up_at" TIMESTAMP(3),
ADD COLUMN "closed_reason" TEXT;

CREATE INDEX "leads_next_follow_up_at_idx" ON "leads"("next_follow_up_at");

ALTER TABLE "reminders"
ADD COLUMN "is_system_task" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "step_index" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "follow_up_rules" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "trigger_days" INTEGER NOT NULL,
  "action_type" TEXT NOT NULL DEFAULT 'follow_up',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "follow_up_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "follow_up_rules_user_id_is_active_idx" ON "follow_up_rules"("user_id", "is_active");

ALTER TABLE "follow_up_rules"
ADD CONSTRAINT "follow_up_rules_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
