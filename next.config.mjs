const nextConfig = {
  reactStrictMode: true,
  distDir:
    process.env.BILOO_PAY_LOCAL_TEST === "1" ? ".next-pay-test" : ".next",
  images: { qualities: [75, 85] },
};
export default nextConfig;
