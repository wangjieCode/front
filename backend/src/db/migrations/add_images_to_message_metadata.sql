ALTER TABLE message_metadata
ADD COLUMN IF NOT EXISTS images jsonb;
