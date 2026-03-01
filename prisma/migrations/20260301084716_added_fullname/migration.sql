-- AlterTable
ALTER TABLE "User" ADD COLUMN     "fullname" TEXT;

-- CreateIndex
CREATE INDEX "EmailVerification_tokenHash_idx" ON "EmailVerification"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordReset_tokenHash_idx" ON "PasswordReset"("tokenHash");
