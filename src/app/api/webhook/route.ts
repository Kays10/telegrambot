import { NextResponse } from "next/server";
import { answerCybersecurityQuestion } from "@/lib/cybersecurity";
import { getSupabaseClient } from "@/lib/supabase";
import {
  createLanCableDiagram,
  isLanCableQuestion,
  sendTelegramMessage,
  sendTelegramPhoto,
} from "@/lib/telegram";

type TelegramUpdate = {
  message?: {
    chat?: { id?: number | string };
    from?: { id?: number | string };
    text?: string;
  };
};

export async function POST(request: Request) {
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("Missing TELEGRAM_WEBHOOK_SECRET");
    return NextResponse.json(
      { error: "Webhook is not configured" },
      { status: 503 },
    );
  }

  if (
    request.headers.get("x-telegram-bot-api-secret-token") !== webhookSecret
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let update: TelegramUpdate;

  try {
    update = (await request.json()) as TelegramUpdate;
  } catch (error) {
    console.error("Telegram webhook received invalid JSON:", error);
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const message = update.message;
  const chatId = message?.chat?.id;
  const userId = message?.from?.id;
  const text = message?.text;

  if (chatId === undefined || userId === undefined || typeof text !== "string") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const telegramChatId = String(chatId);

  try {
    if (text.trim().split(/\s+/, 1)[0] === "/start") {
      await sendTelegramMessage(
        telegramChatId,
        "Welcome to Kryphxx Assist, your cybersecurity guide. Ask me a question about security, or add your reference PDFs at https://kryphxx-assist.vercel.app.",
      );
      return NextResponse.json({ ok: true });
    }

    const answer = await answerCybersecurityQuestion(text);
    const { error } = await getSupabaseClient().from("messages").insert({
      telegram_user_id: String(userId),
      question: text,
      answer,
    });

    if (error) {
      throw new Error(`Failed to save Telegram message: ${error.message}`);
    }

    await sendTelegramMessage(telegramChatId, answer);
    if (isLanCableQuestion(text)) {
      await sendTelegramPhoto(
        telegramChatId,
        await createLanCableDiagram(),
        "LAN / Ethernet cable: a labeled illustration",
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to process Telegram webhook:", error);
    return NextResponse.json(
      { error: "Failed to process Telegram message" },
      { status: 500 },
    );
  }
}
