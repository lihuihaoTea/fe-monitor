import type { Metadata } from 'next';
import { Providers } from '@/components/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: '前端监控管理后台',
  description: '性能 / 稳定性 / 用户行为监控看板',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
