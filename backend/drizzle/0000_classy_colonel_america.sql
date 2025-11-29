CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"parent_message_id" uuid,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_contexts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"work_dir" text NOT NULL,
	"git_branch" varchar(255),
	"relevant_files" jsonb,
	"task_description" text NOT NULL,
	"current_branch_id" uuid NOT NULL,
	"variables" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar(255) NOT NULL,
	"task_id" varchar(255) NOT NULL,
	"status" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "conversations_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "message_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"tool_calls" jsonb,
	"code_changes" jsonb,
	"thinking" text,
	"is_question" boolean DEFAULT false,
	"question_options" jsonb,
	"requires_response" boolean DEFAULT false,
	"references" jsonb,
	"is_invalid" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"role" varchar(50) NOT NULL,
	"content" text NOT NULL,
	"is_complete" boolean DEFAULT true NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"parent_message_id" uuid
);
--> statement-breakpoint
CREATE INDEX "idx_branches_conversation_id" ON "branches" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_branches_parent_message_id" ON "branches" USING btree ("parent_message_id");--> statement-breakpoint
CREATE INDEX "idx_branches_is_active" ON "branches" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_contexts_conversation_id" ON "conversation_contexts" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "unique_contexts_conversation_id" ON "conversation_contexts" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_session_id" ON "conversations" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_task_id" ON "conversations" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_status" ON "conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_conversations_created_at" ON "conversations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_metadata_message_id" ON "message_metadata" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "unique_metadata_message_id" ON "message_metadata" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_metadata_is_question" ON "message_metadata" USING btree ("is_question");--> statement-breakpoint
CREATE INDEX "idx_metadata_requires_response" ON "message_metadata" USING btree ("requires_response");--> statement-breakpoint
CREATE INDEX "idx_messages_conversation_id" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_messages_branch_id" ON "messages" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "idx_messages_timestamp" ON "messages" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_messages_parent_message_id" ON "messages" USING btree ("parent_message_id");