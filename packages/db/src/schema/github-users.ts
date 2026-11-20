import {
	integer,
	pgTable,
	serial,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";

export const githubUsers = pgTable("github_users", {
	id: serial("id").primaryKey(), // 我们自己的自增主键
	githubId: integer("github_id").notNull().unique(), // GitHub 的用户 ID，用 unique 防止重复添加
	login: varchar("login", { length: 39 }).notNull().unique(), // 用户名，GitHub 规定最长 39 个字符
	name: text("name"),
	avatarUrl: text("avatar_url").notNull(),
	htmlUrl: text("html_url").notNull(),
	bio: text("bio"),
	company: text("company"),
	location: text("location"),
	blog: text("blog"),
	publicRepos: integer("public_repos").notNull().default(0),
	followers: integer("followers").notNull().default(0),
	following: integer("following").notNull().default(0),
	note: text("note"), // 我们自己的备注，“修改”功能改的就是它
	ciTestTag: text("ci_test_tag"), // 用于验证 CI 自动迁移；允许为空，兼容已有数据
	githubCreatedAt: timestamp("github_created_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()), // 每次更新时自动刷新
});

// 从表结构自动推导出 TypeScript 类型，前后端都能复用
export type GithubUser = typeof githubUsers.$inferSelect;
export type NewGithubUser = typeof githubUsers.$inferInsert;
