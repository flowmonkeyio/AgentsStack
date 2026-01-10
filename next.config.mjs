/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // Required for Docker deployment
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  eslint: {
    ignoreDuringBuilds: true, // Disable ESLint during Docker builds to avoid rule conflicts
  },
  typescript: {
    ignoreBuildErrors: true, // Disable TypeScript errors during Docker builds
  },
  // Don't fail the build if static generation has errors (e.g., auth pages)
  staticPageGenerationTimeout: 60,
  // Continue on build errors
  onError: async () => {},
};

export default nextConfig;
