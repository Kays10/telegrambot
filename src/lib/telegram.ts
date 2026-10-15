import sharp from "sharp";

export function formatTelegramHtml(text: string): string {
  const codeBlocks: string[] = [];
  const inlineCode: string[] = [];
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/g, (_match, code: string) => {
      const index = codeBlocks.push(`<pre><code>${code.trim()}</code></pre>`) - 1;
      return `\u0000BLOCK${index}\u0000`;
    })
    .replace(/`([^`\n]+)`/g, (_match, code: string) => {
      const index = inlineCode.push(`<code>${code}</code>`) - 1;
      return `\u0000INLINE${index}\u0000`;
    });

  return escaped
    .replace(/^#{1,3}\s+(.+)$/gm, "<b>$1</b>")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/^[ \t]*[-*]\s+/gm, "• ")
    .replace(/\u0000INLINE(\d+)\u0000/g, (_match, index: string) => inlineCode[Number(index)])
    .replace(/\u0000BLOCK(\d+)\u0000/g, (_match, index: string) => codeBlocks[Number(index)]);
}

export function isLanCableQuestion(question: string): boolean {
  return /\b(?:lan|l[`’']?n|ethernet|network)\s+(?:cable|cord|wire)\b|\brj-?45\b/i.test(
    question,
  );
}

export async function createLanCableDiagram(): Promise<Buffer> {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
      <defs>
        <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#101a35"/>
          <stop offset="100%" stop-color="#07101e"/>
        </linearGradient>
        <linearGradient id="cable" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#5eead4"/>
          <stop offset="100%" stop-color="#60a5fa"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="675" rx="32" fill="url(#background)"/>
      <text x="64" y="86" fill="#a5b4fc" font-family="Arial,sans-serif" font-size="22" font-weight="700" letter-spacing="3">NETWORK BASICS</text>
      <text x="64" y="142" fill="#f8fafc" font-family="Arial,sans-serif" font-size="42" font-weight="700">What is a LAN cable?</text>
      <text x="64" y="184" fill="#cbd5e1" font-family="Arial,sans-serif" font-size="24">An Ethernet cable creates a wired connection on a local network.</text>

      <rect x="64" y="238" width="250" height="144" rx="20" fill="#17243b" stroke="#334155" stroke-width="2"/>
      <rect x="92" y="260" width="92" height="66" rx="7" fill="#0b1220" stroke="#67e8f9" stroke-width="4"/>
      <rect x="103" y="270" width="70" height="44" rx="3" fill="#164e63"/>
      <path d="M138 326v13m-24 0h48" stroke="#67e8f9" stroke-width="5" stroke-linecap="round"/>
      <text x="204" y="285" fill="#f8fafc" font-family="Arial,sans-serif" font-size="22" font-weight="700">Computer</text>
      <text x="204" y="318" fill="#94a3b8" font-family="Arial,sans-serif" font-size="18">Ethernet port</text>
      <text x="92" y="361" fill="#cbd5e1" font-family="Arial,sans-serif" font-size="18">Your device</text>

      <path d="M314 310 C390 310 405 310 474 310" fill="none" stroke="url(#cable)" stroke-width="14" stroke-linecap="round"/>
      <path d="M314 310 C390 310 405 310 474 310" fill="none" stroke="#e0f2fe" stroke-opacity=".35" stroke-width="3" stroke-dasharray="10 18" stroke-linecap="round"/>
      <text x="337" y="276" fill="#99f6e4" font-family="Arial,sans-serif" font-size="18" font-weight="700">ETHERNET CABLE</text>

      <rect x="474" y="273" width="84" height="74" rx="8" fill="#dbeafe" stroke="#93c5fd" stroke-width="3"/>
      <path d="M494 281v20m10-20v20m10-20v20m10-20v20m10-20v20m10-20v20" stroke="#b45309" stroke-width="5"/>
      <path d="M486 302h60v33h-44l-16-11z" fill="#cbd5e1" stroke="#94a3b8" stroke-width="2"/>
      <text x="466" y="378" fill="#cbd5e1" font-family="Arial,sans-serif" font-size="18">RJ45 plug</text>

      <path d="M558 310 C628 310 655 310 724 310" fill="none" stroke="url(#cable)" stroke-width="14" stroke-linecap="round"/>
      <path d="M558 310 C628 310 655 310 724 310" fill="none" stroke="#e0f2fe" stroke-opacity=".35" stroke-width="3" stroke-dasharray="10 18" stroke-linecap="round"/>

      <rect x="724" y="238" width="250" height="144" rx="20" fill="#17243b" stroke="#334155" stroke-width="2"/>
      <rect x="758" y="265" width="88" height="63" rx="7" fill="#0b1220" stroke="#a78bfa" stroke-width="4"/>
      <circle cx="774" cy="345" r="5" fill="#34d399"/>
      <circle cx="792" cy="345" r="5" fill="#34d399"/>
      <circle cx="810" cy="345" r="5" fill="#34d399"/>
      <circle cx="828" cy="345" r="5" fill="#34d399"/>
      <text x="864" y="285" fill="#f8fafc" font-family="Arial,sans-serif" font-size="22" font-weight="700">Router / switch</text>
      <text x="864" y="318" fill="#94a3b8" font-family="Arial,sans-serif" font-size="18">Connects devices</text>
      <text x="758" y="369" fill="#cbd5e1" font-family="Arial,sans-serif" font-size="18">Network device</text>

      <rect x="64" y="436" width="1072" height="168" rx="22" fill="#111d32" stroke="#26364f" stroke-width="2"/>
      <text x="96" y="482" fill="#f8fafc" font-family="Arial,sans-serif" font-size="24" font-weight="700">In short</text>
      <text x="96" y="526" fill="#cbd5e1" font-family="Arial,sans-serif" font-size="21">It carries data between your computer and a router, switch, or wall network jack.</text>
      <text x="96" y="567" fill="#94a3b8" font-family="Arial,sans-serif" font-size="19">Common cable types include Cat5e and Cat6. Plug it into an Ethernet port.</text>
    </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: formatTelegramHtml(text),
        parse_mode: "HTML",
      }),
    },
  );

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(
      `Telegram sendMessage failed (${response.status}): ${responseBody}`,
    );
  }
}

export async function sendTelegramPhoto(
  chatId: string,
  photo: Uint8Array,
  caption: string,
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN");
  }

  const form = new FormData();
  const imageBuffer = new ArrayBuffer(photo.byteLength);
  new Uint8Array(imageBuffer).set(photo);
  form.set("chat_id", chatId);
  form.set("photo", new Blob([imageBuffer], { type: "image/png" }), "diagram.png");
  form.set("caption", caption);

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendPhoto`,
    { method: "POST", body: form },
  );

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(
      `Telegram sendPhoto failed (${response.status}): ${responseBody}`,
    );
  }
}
