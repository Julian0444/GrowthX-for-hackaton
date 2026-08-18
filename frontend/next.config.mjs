/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['*.serveousercontent.com'],
  devIndicators: false,
  images: {
    unoptimized: true,
  },
}

export default nextConfig
