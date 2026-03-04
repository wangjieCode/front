CREATE INDEX IF NOT EXISTS "idx_conversations_visibility_created_at"
  ON "conversations" USING btree ("visibility", "created_at");
