ALTER TABLE "users"
ADD COLUMN "display_name" TEXT,
ADD COLUMN "company_name" TEXT,
ADD COLUMN "default_language" TEXT,
ADD COLUMN "default_tone" TEXT,
ADD COLUMN "default_conversation_mode" TEXT,
ADD COLUMN "default_emoji_density" TEXT,
ADD COLUMN "default_output_format" TEXT,
ADD COLUMN "default_follow_up_days" INTEGER,
ADD COLUMN "default_country_code" TEXT,
ADD COLUMN "inbox_default_view" TEXT;

ALTER TABLE "leads"
ADD COLUMN "memory_language" TEXT;
