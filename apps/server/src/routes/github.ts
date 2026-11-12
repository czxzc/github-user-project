import { eq, githubUsers } from "@github-user-project/db";
import { Hono } from "hono";
import { z } from "zod";

import { getDb } from "../db";
import { getGithubProfile, searchGithubUsers } from "../github";
import { validate } from "../validate";

const searchQuery = z.object({
	q: z.string().trim().min(1, "请输入搜索关键字"),
});
const loginParam = z.object({ login: z.string().trim().min(1).max(39) });

export const githubRoutes = new Hono()
	// GET /api/github/search?q=xxx  模糊搜索 GitHub 用户
	.get("/search", validate("query", searchQuery), async (c) => {
		const { q } = c.req.valid("query");
		return c.json(await searchGithubUsers(q));
	})
	// GET /api/github/users/:login  查看某个 GitHub 用户的完整资料（还没入库）
	.get("/users/:login", validate("param", loginParam), async (c) => {
		const { login } = c.req.valid("param");
		const profile = await getGithubProfile(login);
		// 顺便告诉前端：这个人是否已经在库里
		const [saved] = await getDb()
			.select({ id: githubUsers.id })
			.from(githubUsers)
			.where(eq(githubUsers.githubId, profile.githubId));
		return c.json({ ...profile, savedId: saved?.id ?? null });
	});
