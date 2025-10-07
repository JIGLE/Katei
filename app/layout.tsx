import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PAW - Personal Assistant Workspace",
  description: "Mobile-first life management app for tasks, calendar, and meal planning",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
