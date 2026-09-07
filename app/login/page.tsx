import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getUserBySessionToken, SESSION_COOKIE } from "@/lib/auth";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  if (getUserBySessionToken(cookies().get(SESSION_COOKIE)?.value)) redirect("/");
  return <LoginForm />;
}
