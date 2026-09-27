-- WhatsApp Cloud API integration.
--
-- `whatsappMessageId` is Meta's wamid: stable and unique, so it doubles as the
-- idempotency key that makes webhook redelivery a no-op. The unique index is the
-- real duplicate guard; the column itself stays nullable so folder-sourced and
-- manually created messages are unaffected (SQL unique indexes allow many NULLs).

-- AlterTable
ALTER TABLE "School" ADD COLUMN     "whatsappNumber" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "whatsappMessageId" TEXT,
ADD COLUMN     "senderPhone" TEXT,
ADD COLUMN     "senderName" TEXT,
ADD COLUMN     "receivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Message_schoolId_whatsappMessageId_key" ON "Message"("schoolId", "whatsappMessageId");
