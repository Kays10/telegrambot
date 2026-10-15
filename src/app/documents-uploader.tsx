"use client";

import * as tus from "tus-js-client";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const TUS_CHUNK_SIZE = 6 * 1024 * 1024;

type Document = {
  id: string;
  filename: string;
  uploaded_at: string;
  chunk_count: number;
};

type UploadStatus = {
  filename: string;
  message: string;
  success: boolean;
  progress?: number;
};

type Reservation = {
  objectName: string;
  endpoint: string;
  anonKey: string;
};

export default function DocumentsUploader() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [password, setPassword] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [statuses, setStatuses] = useState<UploadStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [libraryError, setLibraryError] = useState("");

  async function loadDocuments() {
    setLoading(true);
    setLibraryError("");

    try {
      const response = await fetch("/api/documents");
      const result = (await response.json()) as {
        documents?: Document[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error ?? "Could not load documents");
      }

      setDocuments(result.documents ?? []);
    } catch (error) {
      setLibraryError(
        error instanceof Error ? error.message : "Could not load documents",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDocuments();
  }, []);

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(event.target.files ?? []));
    setStatuses([]);
  }

  function updateStatus(filename: string, update: Partial<UploadStatus>) {
    setStatuses((current) =>
      current.map((status) =>
        status.filename === filename ? { ...status, ...update } : status,
      ),
    );
  }

  async function reserveUpload(file: File): Promise<Reservation> {
    const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
    const previousObjectName = window.localStorage.getItem(
      `kryphxx-pdf-upload:${fingerprint}`,
    );
    const requestReservation = (objectName?: string) =>
      fetch("/api/documents/reserve", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-document-upload-password": password,
        },
        body: JSON.stringify({
          filename: file.name,
          size: file.size,
          ...(objectName ? { objectName } : {}),
        }),
      });
    let response = await requestReservation(previousObjectName ?? undefined);
    let result = (await response.json()) as Reservation & { error?: string };

    if (response.status === 409 && previousObjectName) {
      window.localStorage.removeItem(`kryphxx-pdf-upload:${fingerprint}`);
      response = await requestReservation();
      result = (await response.json()) as Reservation & { error?: string };
    }

    if (!response.ok) {
      throw new Error(result.error ?? "Could not prepare PDF upload");
    }

    window.localStorage.setItem(
      `kryphxx-pdf-upload:${fingerprint}`,
      result.objectName,
    );

    return result;
  }

  async function uploadToStorage(
    file: File,
    reservation: Reservation,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const upload = new tus.Upload(file, {
        endpoint: reservation.endpoint,
        chunkSize: TUS_CHUNK_SIZE,
        retryDelays: [0, 1000, 3000, 5000, 10000],
        headers: {
          apikey: reservation.anonKey,
          authorization: `Bearer ${reservation.anonKey}`,
        },
        metadata: {
          bucketName: "cybersecurity-pdfs",
          objectName: reservation.objectName,
          contentType: "application/pdf",
          cacheControl: "3600",
        },
        removeFingerprintOnSuccess: true,
        onProgress(bytesUploaded, bytesTotal) {
          updateStatus(file.name, {
            message: `Uploading ${Math.floor((bytesUploaded / bytesTotal) * 100)}%`,
            progress: Math.floor((bytesUploaded / bytesTotal) * 100),
          });
        },
        onError(error) {
          updateStatus(file.name, {
            message: error.message,
            progress: undefined,
          });
          reject(error);
        },
        onSuccess() {
          resolve();
        },
      });

      void upload
        .findPreviousUploads()
        .then((previousUploads) => {
          const previousUpload = previousUploads.find(
            (previous) =>
              previous.metadata?.objectName === reservation.objectName,
          );

          if (previousUpload) {
            upload.resumeFromPreviousUpload(previousUpload);
          }

          upload.start();
        })
        .catch(reject);
    });
  }

  async function uploadFiles(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || files.length === 0) {
      return;
    }

    setUploading(true);
    const results: UploadStatus[] = files.map((file) => ({
      filename: file.name,
      message: "Preparing upload",
      success: false,
    }));
    setStatuses(results);

    for (const file of files) {
      if (file.size < 1 || file.size > MAX_FILE_SIZE) {
        updateStatus(file.name, {
          message: "PDF must be between 1 byte and 50 MB",
        });
        continue;
      }

      try {
        updateStatus(file.name, { message: "Preparing secure upload" });
        const reservation = await reserveUpload(file);
        updateStatus(file.name, { message: "Uploading 0%", progress: 0 });
        await uploadToStorage(file, reservation);

        updateStatus(file.name, { message: "Indexing PDF text", progress: 100 });
        const response = await fetch("/api/documents/process", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-document-upload-password": password,
          },
          body: JSON.stringify({
            filename: file.name,
            objectName: reservation.objectName,
          }),
        });
        const result = (await response.json()) as {
          chunks?: number;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(result.error ?? "Could not index PDF");
        }

        const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
        window.localStorage.removeItem(`kryphxx-pdf-upload:${fingerprint}`);
        updateStatus(file.name, {
          message: `Indexed ${result.chunks} text sections`,
          success: true,
          progress: undefined,
        });
      } catch (error) {
        updateStatus(file.name, {
          message: error instanceof Error ? error.message : "Upload failed",
          progress: undefined,
        });
      }
    }

    if (files.length > 0) {
      await loadDocuments();
    }
    setUploading(false);
  }

  return (
    <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_1.15fr]">
      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-violet-300">
          Knowledge library
        </p>
        <h2 className="mt-3 text-2xl font-semibold">Upload your PDFs</h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Select one or more cybersecurity PDFs. Kryphxx extracts their text,
          indexes it for search, and uses relevant passages when answering in
          Telegram. PDF files themselves are not stored.
        </p>

        <form onSubmit={uploadFiles} className="mt-7 space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-200">
              Upload password
            </span>
            <input
              autoComplete="current-password"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-violet-400"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter the PDF upload password"
              required
              type="password"
              value={password}
            />
            <span className="mt-2 block text-xs leading-5 text-slate-500">
              The password is in your local <code>.env.local</code> file under{" "}
              <code>PDF_UPLOAD_PASSWORD</code>.
            </span>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-200">
              PDF files
            </span>
            <input
              accept="application/pdf,.pdf"
              className="block w-full cursor-pointer rounded-xl border border-dashed border-white/15 bg-black/20 px-4 py-4 text-sm text-slate-400 file:mr-4 file:rounded-lg file:border-0 file:bg-violet-500/15 file:px-3 file:py-2 file:text-sm file:font-medium file:text-violet-200"
              multiple
              onChange={selectFiles}
              type="file"
            />
            <span className="mt-2 block text-xs text-slate-500">
              Up to 50 MB per PDF with resumable upload. Text-based PDFs only;
              scanned pages need OCR.
            </span>
          </label>

          {files.length > 0 && (
            <p className="text-sm text-slate-300">
              {files.length} file{files.length === 1 ? "" : "s"} selected
            </p>
          )}

          <button
            className="w-full rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={uploading || !password || files.length === 0}
            type="submit"
          >
            {uploading ? "Uploading PDFs…" : "Add to knowledge library"}
          </button>
        </form>

        {statuses.length > 0 && (
          <ul aria-live="polite" className="mt-5 space-y-2">
            {statuses.map((status) => (
              <li
                className={`rounded-lg border px-3 py-2 text-sm ${
                  status.success
                    ? "border-emerald-300/15 bg-emerald-300/5 text-emerald-200"
                    : "border-rose-300/15 bg-rose-300/5 text-rose-200"
                }`}
                key={status.filename}
              >
                <span className="font-medium">{status.filename}</span>
                <span className="mt-1 block text-xs opacity-80">
                  {status.message}
                </span>
                {status.progress !== undefined && (
                  <progress
                    aria-label={`Upload progress for ${status.filename}`}
                    className="mt-2 block h-1.5 w-full accent-violet-400"
                    max={100}
                    value={status.progress}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-cyan-300">
              Ready reference
            </p>
            <h2 className="mt-3 text-2xl font-semibold">Indexed documents</h2>
          </div>
          <button
            className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/5"
            disabled={loading}
            onClick={() => void loadDocuments()}
            type="button"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-slate-500">Loading library…</p>
        ) : libraryError ? (
          <p className="mt-8 rounded-xl border border-rose-300/15 bg-rose-300/5 p-4 text-sm text-rose-200">
            {libraryError}
          </p>
        ) : documents.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-white/10 p-8 text-center">
            <p className="text-sm text-slate-300">Your library is empty.</p>
            <p className="mt-2 text-sm text-slate-500">
              Add a PDF and ask the bot about its contents.
            </p>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-white/10">
            {documents.map((document) => (
              <li className="py-4 first:pt-0" key={document.id}>
                <p className="break-words text-sm font-medium text-white">
                  {document.filename}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {document.chunk_count} searchable sections ·{" "}
                  {new Date(document.uploaded_at).toLocaleDateString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
