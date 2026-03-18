-- AlterTable
ALTER TABLE "whatsapp_message_logs"
ADD COLUMN "message_type" TEXT NOT NULL DEFAULT 'text',
ADD COLUMN "transcription_status" TEXT NOT NULL DEFAULT 'not_applicable',
ADD COLUMN "transcription_error" TEXT;

