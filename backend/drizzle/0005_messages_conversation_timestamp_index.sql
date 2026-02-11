CREATE INDEX IF NOT EXISTS "idx_messages_conversation_timestamp" ON "messages" USING btree ("conversation_id","timestamp");
