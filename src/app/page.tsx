import DocumentsUploader from "./documents-uploader";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-6xl">
        <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl shadow-violet-950/20 sm:p-12">
          <div className="mb-10 flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/15 text-lg font-bold text-violet-300"
            >
              K
            </span>
            <span className="text-sm font-semibold tracking-[0.2em] text-white/70">
              KRYPHXX
            </span>
          </div>

          <p className="mb-4 text-sm font-medium uppercase tracking-[0.2em] text-violet-300">
            Your cybersecurity guide
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
            Security answers, grounded in your library.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-400">
            Add your cybersecurity PDFs below. Then message{" "}
            <a
              className="text-violet-300 underline decoration-violet-300/40 underline-offset-4 hover:text-violet-200"
              href="https://t.me/kryphxx_assist_bot"
              rel="noreferrer"
              target="_blank"
            >
              @kryphxx_assist_bot
            </a>{" "}
            with questions. Kryphxx searches relevant passages and cites the
            source document in its answers.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-sm text-emerald-200">
              Cybersecurity Q&amp;A
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300">
              PDF-grounded answers
            </span>
          </div>
        </section>

        <DocumentsUploader />

        <p className="mt-6 text-center text-xs leading-5 text-slate-600">
          For education and authorized defensive work. Do not upload documents
          you are not permitted to store.
        </p>
      </div>
    </main>
  );
}
