import { varlockNextConfigPlugin } from "@varlock/nextjs-integration/plugin";

const withVarlock = varlockNextConfigPlugin();

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	output: process.env.CLOUDFLARE_PAGES === "1" ? "export" : undefined,
	typedRoutes: true,
	reactCompiler: true,
};

export default withVarlock(nextConfig);
