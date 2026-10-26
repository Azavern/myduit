import { redirect } from "next/navigation";

import { currentSessionHash } from "@/server/dal/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const sessionHash = await currentSessionHash();
  redirect(sessionHash ? "/onboarding" : "/login");
}
