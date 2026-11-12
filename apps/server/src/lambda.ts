// AWS Lambda 入口：把 API Gateway 的事件转换成标准 Request 交给 Hono
import { handle } from "hono/aws-lambda";

import { app } from "./app";

export const handler = handle(app);
