-- DropIndex
DROP INDEX "EmailVerification_userId_idx";

-- DropIndex
DROP INDEX "PasswordReset_userId_idx";

-- DropIndex
DROP INDEX "Session_userId_idx";

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "replacedByTokenId" TEXT,
ALTER COLUMN "id" SET DEFAULT gen_random_uuid ();

-- CreateIndex
CREATE INDEX "EmailVerification_userId_tokenHash_idx" ON "EmailVerification"("userId", "tokenHash");

-- CreateIndex
CREATE INDEX "PasswordReset_userId_tokenHash_idx" ON "PasswordReset"("userId", "tokenHash");

-- CreateIndex
CREATE INDEX "Session_refreshTokenHash_userId_idx" ON "Session"("refreshTokenHash", "userId");
