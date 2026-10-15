# Kryphxx Assist

A Next.js 15 Telegram webhook that stores incoming questions in Supabase and
answers cybersecurity questions using Groq and a searchable library of
user-uploaded PDF documents.

## Requirements

- Node.js 20.9 or later
- A Supabase project
- A Telegram bot created with [@BotFather](https://t.me/BotFather)

## Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and set:
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from your
     Supabase project.
   - `TELEGRAM_BOT_TOKEN` from BotFather.
   - `TELEGRAM_WEBHOOK_SECRET` as a random token containing only letters,
     numbers, `_`, or `-`.
   - `GROQ_API_KEY` from your Groq account.
   - `PDF_UPLOAD_PASSWORD` as a strong password to protect PDF uploads.
3. In the Supabase SQL Editor, run the contents of
   [`supabase/schema.sql`](./supabase/schema.sql).
4. Start the app with `npm run dev`, or deploy it to a host that supports
   Next.js and HTTPS.
5. Register the deployed HTTPS endpoint as the bot webhook:

   ```sh
   curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
     --data-urlencode "url=https://<YOUR_DOMAIN>/api/webhook" \
     --data-urlencode "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
   ```

Visit the deployed homepage to upload text-based PDFs (up to 50 MB each), then ask
[@kryphxx_assist_bot](https://t.me/kryphxx_assist_bot) cybersecurity questions.
The bot searches the uploaded document text and asks Groq to answer with
relevant source citations. The original PDF files are not retained; extracted
text chunks are indexed in Supabase. PDFs upload directly to a private Supabase
Storage bucket using resumable 6 MB chunks, so they do not pass through the
Vercel request-size limit. Temporary PDF objects are deleted after indexing.
Telegram replies use readable HTML formatting, and LAN/Ethernet cable questions
also receive a generated, labeled PNG illustration.

The Telegram bot is public: anyone can message it, and all users share the same
uploaded reference library. Only people who know `PDF_UPLOAD_PASSWORD` can add
documents. Retrieved excerpts are sent to Groq to generate answers.

The schema protects upload operations with the upload password and keeps the
document tables inaccessible directly. Only the search and document-list RPCs
are available to the public bot/site.

PDF uploads are limited by the Supabase Free plan to 50 MB per file, with a 5 MB
extracted-text limit and 4,000 searchable chunks per document. Scanned PDFs need
OCR before upload. Run `supabase/schema.sql` in the Supabase SQL Editor to
create/update the private storage bucket, upload-reservation policies, and
ingestion functions. Keep all credentials in `.env.local` and never commit them.

## Local verification

```sh
npm run dev
```

Telegram requires a publicly reachable HTTPS URL for webhooks. For local
development, expose the app through an HTTPS tunnel and register that URL.
