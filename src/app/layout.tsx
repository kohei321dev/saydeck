import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "SayDeck",
  description: "Capture what you want to say and turn it into English study cards.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
