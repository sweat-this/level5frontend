import type { Metadata } from "next";
import { Container } from "@mui/material";
import Characters from "@/Views/Characters/Characters";

const title = "Sweat This - Characters";
const description = "Meet the playable characters in Level 5.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, images: ["/images/logo.png"] },
  twitter: { title, description, images: ["/images/logo.png"] },
};

export default function Page() {
  return (
    <Container maxWidth="lg" sx={{ paddingY: { xs: 4, md: 6 } }}>
      <Characters />
    </Container>
  );
}
