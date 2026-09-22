import type { Metadata } from "next";
import Title from "@/Views/Title";

const title = "Sweat This";
const description =
  "Sweat This - Level 5 high scores, characters, and game info.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, images: ["/images/logo.png"] },
  twitter: { title, description, images: ["/images/logo.png"] },
};

export default function Page() {
  return <Title />;
}
