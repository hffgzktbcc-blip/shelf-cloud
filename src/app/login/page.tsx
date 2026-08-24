import { LoginClient } from "./login-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in — Shelf" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <LoginClient next={next && next.startsWith("/") ? next : "/"} />;
}
