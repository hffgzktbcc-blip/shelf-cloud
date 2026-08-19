import { prisma } from "@/lib/db";
import { KoboClient } from "./kobo-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kobo — Shelf" };

export default async function KoboPage() {
  const token = await prisma.setting.findUnique({ where: { key: "koboSyncToken" } });
  return <KoboClient configured={Boolean(token?.value)} />;
}
