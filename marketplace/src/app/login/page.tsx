import { AuthScreen } from "@/components/marketplace/AuthScreen";
import { getTranslator } from "@/lib/i18n/server";
export async function generateMetadata() { return { title: (await getTranslator()).t("login") }; }
export default function LoginPage() { return <AuthScreen />; }
