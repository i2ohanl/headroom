import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // proxy.ts makes Next buffer request bodies, 10 MB by default. Assignment uploads can be
    // up to 20 MB (UPLOAD_LIMITS), so allow a little more or the body is cut off mid-file.
    proxyClientMaxBodySize: "25mb",
  },
};

export default nextConfig;
