"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The map is now the home route (`/`). Keep /map working for old links and installs.
export default function MapRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return null;
}
