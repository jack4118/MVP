-- AlterTable
ALTER TABLE "ai_logs" ADD COLUMN "style_preset" TEXT;

-- CreateTable
CREATE TABLE "event_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "props" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_logs_user_id_idx" ON "event_logs"("user_id");

-- CreateIndex
CREATE INDEX "event_logs_event_idx" ON "event_logs"("event");

-- CreateIndex
CREATE INDEX "event_logs_created_at_idx" ON "event_logs"("created_at");

-- AddForeignKey
ALTER TABLE "event_logs" ADD CONSTRAINT "event_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
