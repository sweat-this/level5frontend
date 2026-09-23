import { Container } from "@mui/material";

// Account data is per-user and never safe to cache/prerender - see resolveCurrentAccountSession
// and transport.ts's cache: "no-store" on every Backend V2 call.
export const dynamic = "force-dynamic";

export default function AccountLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <Container maxWidth="sm" sx={{ paddingY: { xs: 4, sm: 8 } }}>
      {children}
    </Container>
  );
}
