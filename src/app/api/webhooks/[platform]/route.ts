import { after } from "next/server";

import { getSayDeckChatRuntime } from "@/lib/saydeck-chat-bot";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  context: { params: Promise<{ platform: string }> },
): Promise<Response> {
  const platform = (await context.params).platform;
  if (platform !== "slack" && platform !== "discord") {
    return new Response("Not found", { status: 404 });
  }

  const chatRuntime = getSayDeckChatRuntime();
  if (!chatRuntime || !chatRuntime.platforms.has(platform)) {
    return new Response("Chat integration is not configured", { status: 503 });
  }

  return chatRuntime.bot.webhooks[platform](request, {
    waitUntil(task) {
      after(async () => {
        await task;
      });
    },
  });
}
