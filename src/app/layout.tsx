import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import { Grid } from "@mui/material";
import ThemeRegistry from "@/lib/theme/ThemeRegistry";
import PlatformHeader from "@/Components/platform/PlatformHeader";
import PlatformFooter from "@/Components/platform/PlatformFooter";

const roboto = Roboto({
  weight: ["300", "400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
});

const title = "Sweat This";
const description = "Sweat This is home to Level 5 and Secret Robot.";

export const metadata: Metadata = {
  // No real deployed domain exists yet (see .env.production's blank API base URL); falls back to
  // localhost so metadata URLs still resolve correctly for local dev/CI.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title,
  description,
  icons: { icon: "/images/logo.png" },
  // No approved Sweat This-level social preview image exists yet (issue #22) - the Level 5 logo
  // is game-specific, so omitting openGraph/twitter images here is preferable to a default social
  // image that misrepresents the multi-game platform. Individual game routes may add their own.
  openGraph: {
    type: "website",
    title,
    description,
  },
  twitter: {
    card: "summary",
    title,
    description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={roboto.className}>
      <body>
        <ThemeRegistry>
          <PlatformHeader />
          <Grid id="mainContainer">
            {/* The one semantic <main> landmark for every page (issue #10) - none of the
            nested layouts (account/level5/auth) render their own <main>, so this is safe app-wide. */}
            <Grid id="scrollableContent" component="main">
              {children}
            </Grid>
          </Grid>
          <PlatformFooter />
        </ThemeRegistry>
      </body>
    </html>
  );
}
