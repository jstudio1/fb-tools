import { Suspense } from "react";
import Poster from "./poster";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUserBySessionToken, publicUser, SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function Page() {
  const user = getUserBySessionToken(cookies().get(SESSION_COOKIE)?.value);
  if (!user) redirect("/login");
  return (
    <Suspense fallback={null}>
      <Poster user={publicUser(user)} />
    </Suspense>
  );
}
