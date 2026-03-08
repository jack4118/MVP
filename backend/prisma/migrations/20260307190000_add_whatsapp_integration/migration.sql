-- CreateTable
CREATE TABLE "whatsapp_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "business_account_id" TEXT NOT NULL,
    "phone_number_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "display_phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_message_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "lead_id" TEXT,
    "to_phone" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_message_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_connections_user_id_key" ON "whatsapp_connections"("user_id");
CREATE INDEX "whatsapp_connections_user_id_idx" ON "whatsapp_connections"("user_id");
CREATE INDEX "whatsapp_connections_phone_number_id_idx" ON "whatsapp_connections"("phone_number_id");
CREATE INDEX "whatsapp_message_logs_user_id_idx" ON "whatsapp_message_logs"("user_id");
CREATE INDEX "whatsapp_message_logs_lead_id_idx" ON "whatsapp_message_logs"("lead_id");
CREATE INDEX "whatsapp_message_logs_status_idx" ON "whatsapp_message_logs"("status");

-- AddForeignKey
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_message_logs" ADD CONSTRAINT "whatsapp_message_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_message_logs" ADD CONSTRAINT "whatsapp_message_logs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
