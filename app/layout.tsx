// File: app/layout.tsx
import './globals.css';

import Observability from "../components/observability";

export const metadata = {
  title: 'TEDxSDG',
  description: 'TEDxSDG',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Add viewport meta tag */}
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <Observability />
        {/* Main viewport section with full height */}
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </body>
    </html>
  );
}
