ALTER TABLE "leads"
ADD COLUMN "memory_summary" TEXT,
ADD COLUMN "memory_goal" TEXT,
ADD COLUMN "ai_tone_preference" TEXT,
ADD COLUMN "ai_conversation_mode" TEXT,
ADD COLUMN "ai_emoji_density" TEXT,
ADD COLUMN "ai_output_format" TEXT,
ADD COLUMN "memory_updated_at" TIMESTAMP(3);
