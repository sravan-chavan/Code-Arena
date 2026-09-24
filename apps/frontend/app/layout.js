import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";

export const metadata = {
  title: "CodeArena — Lab-Based Coding Competition Platform",
  description: "A secure, real-time coding competition platform designed for controlled laboratory environments. Conduct fair coding competitions with centralized management.",
  keywords: "coding competition, lab-based, programming contest, CodeArena",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
