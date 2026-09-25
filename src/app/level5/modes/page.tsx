import type { Metadata } from "next";
import { Container } from "@mui/material";
import Modes from "@/Views/Modes/Modes";

const title = "Sweat This - Level 5 Modes";
const description =
  "Level 5's basketball scoring and skill modes, shot contests, combat, CPU and progression modes, and open play.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, images: ["/images/logo.png"] },
  twitter: { title, description, images: ["/images/logo.png"] },
};

export default function Page() {
  return (
    <Container maxWidth="lg" sx={{ paddingY: { xs: 4, md: 6 } }}>
      <Modes />
    </Container>
  );
}
