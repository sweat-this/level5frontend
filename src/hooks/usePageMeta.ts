import { useEffect } from "react";

interface PageMeta {
  title: string;
  description: string;
}

function setMetaContent(selector: string, content: string) {
  document.head.querySelector(selector)?.setAttribute("content", content);
}

// The SPA only ships one static <title>/OG/Twitter block in index.html, so every route shared a
// link preview regardless of what it actually points to. No react-helmet dependency needed for
// four static routes - setting the tags already in index.html is enough.
export default function usePageMeta({ title, description }: PageMeta) {
  useEffect(() => {
    document.title = title;
    setMetaContent('meta[name="description"]', description);
    setMetaContent('meta[property="og:title"]', title);
    setMetaContent('meta[property="og:description"]', description);
    setMetaContent('meta[name="twitter:title"]', title);
    setMetaContent('meta[name="twitter:description"]', description);
  }, [title, description]);
}
