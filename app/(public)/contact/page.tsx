"use client";

import { socialLinks } from "@/lib/socialLinks";
import { useState, type FormEvent } from "react";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSending(true);
    setStatus(null);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        throw new Error(data.message ?? "Unable to send your message. Please try again later.");
      }

      setName("");
      setEmail("");
      setMessage("");
      setStatus({ type: "success", message: "Thanks — your message has been sent." });
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to send your message. Please try again later.",
      });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="bg-brand-cream px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-4xl font-black text-brand-dark sm:text-5xl">Get in Touch</h1>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5 rounded-2xl border border-brand-green/25 bg-white p-8 shadow-sm">
          <div>
            <label htmlFor="name" className="mb-2 block text-sm font-semibold text-brand-dark">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              disabled={isSending}
              className="w-full rounded-md border border-brand-creamDark bg-brand-cream px-4 py-3 text-brand-dark outline-none ring-brand-green focus:ring-2"
              placeholder="Your name"
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-semibold text-brand-dark">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={isSending}
              className="w-full rounded-md border border-brand-creamDark bg-brand-cream px-4 py-3 text-brand-dark outline-none ring-brand-green focus:ring-2"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="message" className="mb-2 block text-sm font-semibold text-brand-dark">
              Message
            </label>
            <textarea
              id="message"
              name="message"
              rows={6}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              required
              disabled={isSending}
              className="w-full rounded-md border border-brand-creamDark bg-brand-cream px-4 py-3 text-brand-dark outline-none ring-brand-green focus:ring-2"
              placeholder="Drop us your question, topic request, or feedback"
            />
          </div>

          <button
            type="submit"
            disabled={isSending}
            className="rounded-md bg-brand-green px-6 py-3 font-semibold text-brand-cream transition-colors hover:bg-brand-greenLight disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSending ? "Sending…" : "Submit"}
          </button>
          {status ? (
            <p className={status.type === "success" ? "text-sm text-green-700" : "text-sm text-red-700"} role="status">
              {status.message}
            </p>
          ) : null}
        </form>

        <section className="mt-10 rounded-2xl bg-brand-dark p-6 text-brand-cream">
          <h2 className="text-xl font-bold">Follow the show</h2>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            {socialLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md bg-brand-green/30 px-3 py-2 transition-colors hover:bg-brand-green/50"
              >
                {link.label}
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
