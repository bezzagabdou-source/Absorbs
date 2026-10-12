import { redirect } from "next/navigation";

/** Short public alias: the memory & context manager lives inside the signed-in app. */
export default function MemoryAliasPage() {
  redirect("/app/settings/memory");
}
