// 本地开发入口：先让 varlock 把 .env 读进 process.env，再启动 HTTP 服务
import "varlock/auto-load";

import { serve } from "@hono/node-server";

import { app } from "./app";

serve({ fetch: app.fetch, port: 3000 }, (info) => {
	console.log(`Server is running on http://localhost:${info.port}`);
});
