import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";

// 包一层 zValidator：校验失败时统一返回 { error: "..." }，前端和 Android 处理起来更简单
export const validate = <
	T extends ZodType,
	Target extends keyof ValidationTargets,
>(
	target: Target,
	schema: T,
) =>
	zValidator(target, schema, (result, c) => {
		if (!result.success) {
			return c.json(
				{ error: result.error.issues[0]?.message ?? "参数不正确" },
				400,
			);
		}
	});
