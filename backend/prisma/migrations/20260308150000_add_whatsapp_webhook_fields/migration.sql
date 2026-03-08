-- AlterTable
ALTER TABLE "whatsapp_message_logs"
  ADD COLUMN "message_id" TEXT,
  ADD COLUMN "direction" TEXT NOT NULL DEFAULT 'outbound',
  ADD COLUMN "from_phone" TEXT,
  ADD COLUMN "external_timestamp" TIMESTAMP(3),
  ADD COLUMN "raw_payload" JSONB;

-- CreateIndex
CREATE INDEX "whatsapp_message_logs_message_id_idx" ON "whatsapp_message_logs"("message_id");
CREATE INDEX "whatsapp_message_logs_from_phone_idx" ON "whatsapp_message_logs"("from_phone");
CREATE INDEX "whatsapp_message_logs_to_phone_idx" ON "whatsapp_message_logs"("to_phone");
