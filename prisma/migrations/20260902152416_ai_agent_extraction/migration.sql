-- AlterTable
ALTER TABLE "ActionItem" ADD COLUMN     "assignee" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "subject" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "extractedJson" JSONB;
