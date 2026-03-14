CREATE TABLE "whatsapp_conversation_states" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "lead_id" TEXT,
    "last_message_id" TEXT,
    "last_message_preview" TEXT,
    "last_direction" TEXT,
    "last_status" TEXT,
    "last_error" TEXT,
    "last_message_at" TIMESTAMP(3),
    "last_inbound_at" TIMESTAMP(3),
    "last_outbound_at" TIMESTAMP(3),
    "last_read_at" TIMESTAMP(3),
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_conversation_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_conversation_states_user_id_phone_key"
ON "whatsapp_conversation_states"("user_id", "phone");

CREATE INDEX "whatsapp_conversation_states_user_id_unread_count_idx"
ON "whatsapp_conversation_states"("user_id", "unread_count");

CREATE INDEX "whatsapp_conversation_states_user_id_last_message_at_idx"
ON "whatsapp_conversation_states"("user_id", "last_message_at");

ALTER TABLE "whatsapp_conversation_states"
ADD CONSTRAINT "whatsapp_conversation_states_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "whatsapp_conversation_states"
ADD CONSTRAINT "whatsapp_conversation_states_lead_id_fkey"
FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
