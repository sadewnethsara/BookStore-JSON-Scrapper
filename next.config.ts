import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ["@lumina/shared-types", "@lumina/supabase-client"],
};

export default nextConfig;
