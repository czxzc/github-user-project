import { drizzle } from "drizzle-orm/node-postgres";

import type { DatabaseConfig } from "./config";
import { relations } from "./relations";

export function createDb(env: DatabaseConfig) {
	return drizzle(env.DATABASE_URL, { relations });
}

export type Database = ReturnType<typeof createDb>;

export { desc, eq } from "drizzle-orm";
// 把表和常用查询工具一起导出，后端只需要依赖这一个包
export * from "./schema";
