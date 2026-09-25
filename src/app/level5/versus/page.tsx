import type { Metadata } from "next";
import { Container } from "@mui/material";
import Versus from "@/Views/Versus/Versus";

const title = "Sweat This - Level 5 Versus";
const description =
  "Level 5 competitive play: CPU Versus, and asynchronous correspondence series between two players.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, images: ["/images/logo.png"] },
  twitter: { title, description, images: ["/images/logo.png"] },
};

export default function Page() {
  return (
    <Container maxWidth="lg" sx={{ paddingY: { xs: 4, md: 6 } }}>
      <Versus />
    </Container>
  );
}
