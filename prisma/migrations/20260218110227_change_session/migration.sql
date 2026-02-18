/*
  Warnings:

  - A unique constraint covering the columns `[refreshTokenHash]` on the table `Session` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Session" ALTER COLUMN "id" SET DEFAULT gen_random_uuid ();

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshTokenHash_key" ON "Session"("refreshTokenHash");
