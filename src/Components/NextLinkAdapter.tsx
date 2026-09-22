"use client";

import { forwardRef, type ReactNode } from "react";
import Link, { type LinkProps } from "next/link";

interface NextLinkAdapterProps extends LinkProps {
  children?: ReactNode;
  className?: string;
}

// Smallest adapter needed for MUI's `component` prop composition (e.g. Button/ListItemButton) to
// render a next/link Link instead of react-router's.
const NextLinkAdapter = forwardRef<HTMLAnchorElement, NextLinkAdapterProps>(
  function NextLinkAdapter(props, ref) {
    return <Link ref={ref} {...props} />;
  },
);

export default NextLinkAdapter;
