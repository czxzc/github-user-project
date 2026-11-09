import { z } from "zod";

// 直接读 process.env，本地和 Lambda 都能用
const configSchema = z.object({
	DATABASE_URL: z.string().min(1, "缺少 DATABASE_URL"),
	CORS_ORIGIN: z.string().default("*"),
	GITHUB_TOKEN: z.string().optional(),
	GITHUB_API_URL: z.string().default("https://api.github.com"),
});

export type Config = z.infer<typeof configSchema>;

let cached: Config | undefined;

// 第一次用到时才读取并校验，读一次后缓存
export function getConfig(): Config {
	cached ??= configSchema.parse(process.env);
	return cached;
}
