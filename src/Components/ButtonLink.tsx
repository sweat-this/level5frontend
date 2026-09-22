"use client";

import { Button, type ButtonProps } from "@mui/material";
import NextLinkAdapter from "./NextLinkAdapter";

export default function ButtonLink({
  href,
  ...props
}: ButtonProps & { href: string }) {
  return <Button component={NextLinkAdapter} href={href} {...props} />;
}
