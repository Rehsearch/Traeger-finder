"use client";

import { useEffect } from "react";
import { initLinkedInInsightIfConsented } from "@/lib/linkedinInsight";

export default function LinkedInInsight() {
  useEffect(() => {
    initLinkedInInsightIfConsented();
  }, []);

  return null;
}
