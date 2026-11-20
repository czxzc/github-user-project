import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";

import { getConfig } from "./config";
import { GithubError } from "./github";
import { githubRoutes } from "./routes/github";
import { userRoutes } from "./routes/users";

// 这里只“组装” app，不负责监听端口。
// 本地由 index.ts 启动，线上由 lambda.ts 交给 Lambda，同一份路由代码两处复用。
export const app = new Hono();

app.use(logger());
app.use(
	"/*",
	cors({
		origin: getConfig()
			.CORS_ORIGIN.split(",")
			.map((s) => s.trim()),
		allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
		allowHeaders: ["Content-Type"],
	}),
);

app.get("/", (c) => c.text("OK"));
app.get("/health", (c) =>
	c.json({ status: "ok", version: "ci-migration-test-20261120" }),
);

app.route("/api/github", githubRoutes);
app.route("/api/users", userRoutes);

app.notFound((c) => c.json({ error: "接口不存在" }, 404));

// 统一错误处理：任何地方抛出的错误都在这里变成 { error: "..." }
app.onError((err, c) => {
	if (err instanceof GithubError)
		return c.json({ error: err.message }, err.status);
	if (err instanceof HTTPException)
		return c.json({ error: err.message }, err.status);
	console.error(err);
	return c.json({ error: "服务器内部错误" }, 500);
});
