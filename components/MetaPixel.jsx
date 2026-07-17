"use client";

import { useEffect } from "react";
import { initMetaPixelIfConsented } from "@/lib/metaPixel";

export default function MetaPixel() {
  useEffect(() => {
    initMetaPixelIfConsented();
  }, []);

  return null;
}
