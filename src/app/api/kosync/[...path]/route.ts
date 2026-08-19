import { NextResponse } from "next/server";
import {
  checkAuth,
  getProgress,
  getUser,
  md5,
  putProgress,
  shelfPercentage,
  setUser,
  type Progress,
} from "@/lib/kosync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * KOReader's progress-sync API. Point the device's custom sync server at
 * http://<this-machine>:3000/api/kosync and it will call the paths below.
 */

// KOReader's own error shape, so its UI shows something sensible.
function err(code: number, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

const UNAUTHORIZED = () => err(2001, "Unauthorized", 401);

function creds(req: Request) {
  return {
    username: req.headers.get("x-auth-user") ?? undefined,
    key: req.headers.get("x-auth-key") ?? undefined,
  };
}

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const route = path.join("/");

  if (route === "healthcheck") return NextResponse.json({ state: "OK" });

  const { username, key } = creds(req);
  if (!(await checkAuth(username, key))) return UNAUTHORIZED();

  if (route === "users/auth") return NextResponse.json({ authorized: "OK" });

  if (path[0] === "syncs" && path[1] === "progress" && path[2]) {
    const p = await getProgress(path[2]);
    const percentage = await shelfPercentage(path[2]);
    const mergedPercentage =
      percentage === null ? null : Math.max(percentage, p?.percentage ?? 0);
    // KOReader treats an empty document as "nothing synced yet" rather than an error.
    return NextResponse.json(
      p
        ? {
            ...p,
            ...(mergedPercentage === null
              ? {}
              : { percentage: mergedPercentage, progress: String(mergedPercentage) }),
          }
        : {
            document: path[2],
            ...(mergedPercentage === null
              ? {}
              : { percentage: mergedPercentage, progress: String(mergedPercentage) }),
          },
    );
  }

  return err(404, "Not found", 404);
}

export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (path.join("/") !== "users/create") return err(404, "Not found", 404);

  const body = await req.json().catch(() => null);
  const username = body?.username as string | undefined;
  const password = body?.password as string | undefined;
  if (!username || !password) return err(2003, "Invalid request", 400);

  if (await getUser()) return err(2002, "Username is already registered.", 409);

  // KOReader hashes the password before sending; a direct call might not.
  await setUser(username, password.length === 32 ? password : md5(password));
  return NextResponse.json({ username }, { status: 201 });
}

export async function PUT(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (path.join("/") !== "syncs/progress") return err(404, "Not found", 404);

  const { username, key } = creds(req);
  if (!(await checkAuth(username, key))) return UNAUTHORIZED();

  const body = await req.json().catch(() => null);
  if (!body?.document) return err(2003, "Invalid request", 400);

  const timestamp = Math.floor(Date.now() / 1000);
  const progress: Progress = {
    document: body.document,
    progress: String(body.progress ?? ""),
    percentage: Number(body.percentage ?? 0),
    device: String(body.device ?? "Kobo"),
    device_id: body.device_id ? String(body.device_id) : undefined,
    timestamp,
  };

  await putProgress(progress);
  return NextResponse.json({ document: progress.document, timestamp });
}
