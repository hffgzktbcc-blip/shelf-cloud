import { prisma } from "@/lib/db";
import { WelcomeClient } from "./welcome-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Welcome — Shelf" };

export default async function WelcomePage() {
  const bookCount = await prisma.book.count();
  return <WelcomeClient hasBooks={bookCount > 0} />;
}
