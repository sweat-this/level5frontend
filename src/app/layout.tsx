import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import { Grid } from "@mui/material";
import ThemeRegistry from "@/lib/theme/ThemeRegistry";

const roboto = Roboto({
  weight: ["300", "400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
});

const title = "Sweat This";
const description =
  "Sweat This - Level 5 high scores, characters, and game info.";

export const metadata: Metadata = {
  // No real deployed domain exists yet (see .env.production's blank API base URL); falls back to
  // localhost so OG/Twitter image URLs still resolve correctly for local dev/CI.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title,
  description,
  icons: { icon: "/images/logo.png" },
  openGraph: {
    type: "website",
    title,
    description,
    images: ["/images/logo.png"],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/images/logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={roboto.className}>
      <body>
        <ThemeRegistry>
          <Grid id="mainContainer">
            <Grid id="scrollableContent">{children}</Grid>
          </Grid>
          <Grid id="footer" />
        </ThemeRegistry>
      </body>
    </html>
  );
}
