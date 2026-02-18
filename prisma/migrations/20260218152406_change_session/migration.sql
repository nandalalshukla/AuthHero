/*
  Warnings:

  - You are about to drop the column `replacedByTokenId` on the `Session` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Session" DROP COLUMN "replacedByTokenId",
ADD COLUMN     "lastRotatedAt" TIMESTAMP(3),
ALTER COLUMN "id" SET DEFAULT gen_random_uuid ();
