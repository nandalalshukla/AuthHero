-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deactivatedAt" TIMESTAMP(6),
ADD COLUMN     "deletedAt" TIMESTAMP(6);
