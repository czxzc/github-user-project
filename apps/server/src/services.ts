import { createDb } from "@github-user-project/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
