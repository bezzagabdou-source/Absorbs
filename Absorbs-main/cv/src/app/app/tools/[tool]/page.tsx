"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { getTool, TOOLS } from "@/lib/tools";
import { ToolRunner } from "@/components/app/tool-runner";

export default function ToolPage() {
  const params = useParams<{ tool: string }>();
  const router = useRouter();
  const tool = getTool(params.tool);

  useEffect(() => {
    if (!tool) router.replace("/app/tools");
  }, [tool, router]);

  if (!tool) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Link href="/app/tools" className="btn-ghost text-sm">
          {TOOLS.length} →
        </Link>
      </div>
    );
  }
  return <ToolRunner key={tool.id} tool={tool} />;
}
