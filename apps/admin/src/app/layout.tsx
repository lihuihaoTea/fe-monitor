import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '前端监控管理后台',
  description: '实时监控前端应用性能与错误',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
