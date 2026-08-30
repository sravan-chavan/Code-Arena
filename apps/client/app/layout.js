export const metadata = {
  title: 'CodeArena',
  description: 'CodeArena participant client (Milestone 0 skeleton)',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: '2rem' }}>
        {children}
      </body>
    </html>
  );
}
