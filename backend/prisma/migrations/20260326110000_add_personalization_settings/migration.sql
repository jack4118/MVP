ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "base_style_tone" TEXT,
  ADD COLUMN IF NOT EXISTS "character_warmth" TEXT,
  ADD COLUMN IF NOT EXISTS "character_enthusiasm" TEXT,
  ADD COLUMN IF NOT EXISTS "character_headers_lists" TEXT,
  ADD COLUMN IF NOT EXISTS "character_emoji" TEXT,
  ADD COLUMN IF NOT EXISTS "custom_instructions" TEXT,
  ADD COLUMN IF NOT EXISTS "nickname" TEXT,
  ADD COLUMN IF NOT EXISTS "occupation" TEXT,
  ADD COLUMN IF NOT EXISTS "about_you" TEXT,
  ADD COLUMN IF NOT EXISTS "memory_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "record_history_enabled" BOOLEAN NOT NULL DEFAULT true;
