import type { Metadata } from "next";
import { Container } from "@mui/material";
import DrBlood from "@/Views/DrBlood";

const title = "Sweat This - Dr Blood";
const description = "Dr Blood videos and highlights from Level 5.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, images: ["/images/logo.png"] },
  twitter: { title, description, images: ["/images/logo.png"] },
};

export default function Page() {
  return (
    <Container maxWidth="lg" sx={{ paddingY: { xs: 4, md: 6 } }}>
      <DrBlood />
    </Container>
  );
}
