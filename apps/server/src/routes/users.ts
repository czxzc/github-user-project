import { desc, eq, githubUsers } from "@github-user-project/db";
import { Hono } from "hono";
import { z } from "zod";

import { getDb } from "../db";
import { getGithubProfile, getGithubProfileById } from "../github";
import { validate } from "../validate";

const idParam = z.object({
	id: z.coerce.number({ error: "id 不正确" }).int().positive("id 不正确"),
});
const createBody = z.object({
	login: z.string().trim().min(1, "请输入用户名").max(39),
});
const updateBody = z.object({
	note: z.string().trim().max(500, "备注最多 500 字").nullable(),
});

export const userRoutes = new Hono()
	// 查：列表，最新添加的排前面
	.get("/", async (c) => {
		const rows = await getDb()
			.select()
			.from(githubUsers)
			.orderBy(desc(githubUsers.createdAt));
		return c.json(rows);
	})
	// 查：单条
	.get("/:id", validate("param", idParam), async (c) => {
		const { id } = c.req.valid("param");
		const [row] = await getDb()
			.select()
			.from(githubUsers)
			.where(eq(githubUsers.id, id));
		if (!row) return c.json({ error: "记录不存在" }, 404);
		return c.json(row);
	})
	// 增：前端只传用户名，资料由后端去 GitHub 取，避免前端伪造数据
	.post("/", validate("json", createBody), async (c) => {
		const { login } = c.req.valid("json");
		const profile = await getGithubProfile(login);
		const [row] = await getDb()
			.insert(githubUsers)
			.values(profile)
			.onConflictDoNothing() // 撞上唯一约束（已添加过）就什么都不做
			.returning();
		if (!row) return c.json({ error: `${profile.login} 已经添加过了` }, 409);
		return c.json(row, 201);
	})
	// 改：修改备注
	.patch(
		"/:id",
		validate("param", idParam),
		validate("json", updateBody),
		async (c) => {
			const { id } = c.req.valid("param");
			const { note } = c.req.valid("json");
			const [row] = await getDb()
				.update(githubUsers)
				.set({ note: note || null })
				.where(eq(githubUsers.id, id))
				.returning();
			if (!row) return c.json({ error: "记录不存在" }, 404);
			return c.json(row);
		},
	)
	// 改：从 GitHub 重新拉取最新资料（备注保留）
	.post("/:id/refresh", validate("param", idParam), async (c) => {
		const { id } = c.req.valid("param");
		const db = getDb();
		const [existing] = await db
			.select()
			.from(githubUsers)
			.where(eq(githubUsers.id, id));
		if (!existing) return c.json({ error: "记录不存在" }, 404);
		const profile = await getGithubProfileById(existing.githubId);
		const [row] = await db
			.update(githubUsers)
			.set(profile)
			.where(eq(githubUsers.id, id))
			.returning();
		return c.json(row);
	})
	// 删
	.delete("/:id", validate("param", idParam), async (c) => {
		const { id } = c.req.valid("param");
		const [row] = await getDb()
			.delete(githubUsers)
			.where(eq(githubUsers.id, id))
			.returning({ id: githubUsers.id });
		if (!row) return c.json({ error: "记录不存在" }, 404);
		return c.body(null, 204);
	});
