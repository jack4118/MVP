-- CreateEnum
CREATE TYPE "OrchestratorCredentialStatus" AS ENUM ('active', 'expiring', 'expired', 'disabled');

-- CreateTable
CREATE TABLE "orchestrator_credentials" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3),
  "status" "OrchestratorCredentialStatus" NOT NULL DEFAULT 'active',
  "last_notified_at" TIMESTAMP(3),
  "updated_by" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "orchestrator_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orchestrator_pending_updates" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "pending_value" TEXT NOT NULL,
  "requested_by_chat_id" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "orchestrator_pending_updates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orchestrator_credentials_key_key" ON "orchestrator_credentials"("key");
CREATE INDEX "orchestrator_credentials_key_status_idx" ON "orchestrator_credentials"("key", "status");
CREATE INDEX "orchestrator_credentials_expires_at_idx" ON "orchestrator_credentials"("expires_at");
CREATE INDEX "orchestrator_pending_updates_key_requested_by_chat_id_idx" ON "orchestrator_pending_updates"("key", "requested_by_chat_id");
CREATE INDEX "orchestrator_pending_updates_expires_at_idx" ON "orchestrator_pending_updates"("expires_at");
