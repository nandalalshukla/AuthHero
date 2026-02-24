/*
  Warnings:

  - You are about to drop the column `secret` on the `MFASecret` table. All the data in the column will be lost.
  - The `backupCodes` column on the `MFASecret` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `secretHash` to the `MFASecret` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "MFASecret" DROP COLUMN "secret",
ADD COLUMN     "enabledAt" TIMESTAMP(3),
ADD COLUMN     "secretHash" TEXT NOT NULL,
ADD COLUMN     "verified" BOOLEAN NOT NULL DEFAULT false,
DROP COLUMN "backupCodes",
ADD COLUMN     "backupCodes" TEXT[];

-- AlterTable
ALTER TABLE "Session" ALTER COLUMN "id" SET DEFAULT gen_random_uuid ();

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
