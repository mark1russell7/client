import { useEffect, useState } from "react";

/** The state of a CSS media query, for example "(max-width: 720px)". */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = (): void => setMatches(list.matches);
    onChange();
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** The width below which the site uses its phone layout. Keep it equal to the media queries of app.css. */
export const PHONE_QUERY = "(max-width: 720px)";
