import type { Metadata } from "next";
import { sanitizeAccountReturnTo } from "@/lib/account/return-to";
import RegisterForm from "./RegisterForm";

export const metadata: Metadata = {
  title: "Sweat This - Create Account",
  description: "Create a Sweat This account.",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawReturnTo = Array.isArray(params.returnTo)
    ? params.returnTo[0]
    : params.returnTo;
  const returnTo = sanitizeAccountReturnTo(rawReturnTo);

  return <RegisterForm returnTo={returnTo} />;
}
