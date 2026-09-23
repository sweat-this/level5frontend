import type { Metadata } from "next";
import { sanitizeAccountReturnTo } from "@/lib/account/return-to";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Sweat This - Log In",
  description: "Log in to your Sweat This account.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawReturnTo = Array.isArray(params.returnTo)
    ? params.returnTo[0]
    : params.returnTo;
  const returnTo = sanitizeAccountReturnTo(rawReturnTo);

  return <LoginForm returnTo={returnTo} />;
}
