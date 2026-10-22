import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import { Bricolage_Grotesque, DM_Sans, JetBrains_Mono, Archivo_Black } from "next/font/google";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--f-display",
});
const body = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--f-body",
});
const code = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--f-code",
});
const brand = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  variable: "--f-brand",
});

export const metadata = {
  title: "CodeArena — Lab-Based Coding Competition Platform",
  description: "A secure, real-time coding competition platform designed for controlled laboratory environments. Conduct fair coding competitions with centralized management.",
  keywords: "coding competition, lab-based, programming contest, CodeArena",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${code.variable} ${brand.variable}`}>
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}