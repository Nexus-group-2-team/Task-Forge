-- DropIndex
DROP INDEX "password_reset_tokens_tokenHash_idx";

-- DropIndex
DROP INDEX "users_email_idx";

-- CreateIndex
CREATE INDEX "auth_sessions_refreshTokenDigest_idx" ON "auth_sessions"("refreshTokenDigest");
