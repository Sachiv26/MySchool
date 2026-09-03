-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "term" INTEGER,
ADD COLUMN     "year" INTEGER;

-- CreateTable
CREATE TABLE "ParentDocument" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "childId" TEXT,
    "schoolId" TEXT NOT NULL,
    "term" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "storedPath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParentDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParentDocument_parentId_term_year_idx" ON "ParentDocument"("parentId", "term", "year");

-- CreateIndex
CREATE INDEX "ParentDocument_childId_idx" ON "ParentDocument"("childId");

-- CreateIndex
CREATE INDEX "ParentDocument_schoolId_idx" ON "ParentDocument"("schoolId");

-- CreateIndex
CREATE INDEX "Message_term_year_idx" ON "Message"("term", "year");

-- AddForeignKey
ALTER TABLE "ParentDocument" ADD CONSTRAINT "ParentDocument_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ParentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentDocument" ADD CONSTRAINT "ParentDocument_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentDocument" ADD CONSTRAINT "ParentDocument_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
