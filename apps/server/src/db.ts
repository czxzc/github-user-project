import { createDb, type Database } from "@github-user-project/db";

import { getConfig } from "./config";

let db: Database | undefined;

// 懒加载：第一次查询时才建立连接池，Lambda 实例复用时直接拿缓存
export function getDb(): Database {
	db ??= createDb({ DATABASE_URL: getConfig().DATABASE_URL });
	return db;
}
