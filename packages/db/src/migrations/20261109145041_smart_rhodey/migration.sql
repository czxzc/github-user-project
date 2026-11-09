CREATE TABLE "github_users" (
	"id" serial PRIMARY KEY,
	"github_id" integer NOT NULL UNIQUE,
	"login" varchar(39) NOT NULL UNIQUE,
	"name" text,
	"avatar_url" text NOT NULL,
	"html_url" text NOT NULL,
	"bio" text,
	"company" text,
	"location" text,
	"blog" text,
	"public_repos" integer DEFAULT 0 NOT NULL,
	"followers" integer DEFAULT 0 NOT NULL,
	"following" integer DEFAULT 0 NOT NULL,
	"note" text,
	"github_created_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
