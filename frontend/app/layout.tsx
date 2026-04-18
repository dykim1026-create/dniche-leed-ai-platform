export const metadata = {
  title: "Dniche LEED AI Platform",
  description: "Starter frontend for Dniche Partners"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "Arial, sans-serif", margin: 0, padding: 24 }}>
        {children}
      </body>
    </html>
  );
}
