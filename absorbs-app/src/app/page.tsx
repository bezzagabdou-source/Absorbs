import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Entry point: signed-in users go straight to the feed, guests to the welcome/auth screen. */
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  redirect(user ? "/feed" : "/welcome");
}
