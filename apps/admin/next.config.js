/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    'antd',
    '@ant-design/icons',
    '@ant-design/charts',
    '@ant-design/plots',
    '@ant-design/cssinjs',
  ],
};

module.exports = nextConfig;
