import { Container } from "@mui/material";

// Deliberately its own, minimal layout (issue #6: "Do not make login/register inherit protected
// account layout behavior") - no MainNavBar, no dashboard chrome, just a centered container for
// the login/register forms.
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <Container maxWidth="xs" sx={{ paddingY: { xs: 4, sm: 8 } }}>
      {children}
    </Container>
  );
}
