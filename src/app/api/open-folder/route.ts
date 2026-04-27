import { assertJsonViewWriteAuth } from "@/lib/auth-guard";
import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

function openDirectory(dir: string): void {
  const platform = process.platform;
  if (platform === "win32") {
    spawn("explorer.exe", [dir], { detached: true, stdio: "ignore" }).unref();
  } else if (platform === "darwin") {
    spawn("open", [dir], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [dir], { detached: true, stdio: "ignore" }).unref();
  }
}

export async function POST() {
  try {
    const auth = await assertJsonViewWriteAuth();
    if (auth) {
      return auth;
    }

    const outputDir = path.join(process.cwd(), "output");
    openDirectory(outputDir);

    return NextResponse.json({ success: true, platform: process.platform });
  } catch (error: unknown) {
    console.error("Error opening folder:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
