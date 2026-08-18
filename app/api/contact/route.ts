import { NextResponse } from "next/server";
import { Resend } from "resend";

type ContactRequest = {
  name?: unknown;
  email?: unknown;
  message?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ContactRequest;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!name || !email || !message) {
    return NextResponse.json({ message: "Name, email, and message are required." }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[contact] RESEND_API_KEY is not configured.");
    return NextResponse.json({ message: "Contact email is not configured." }, { status: 500 });
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: "Draft Academical Contact <contact@draftacademical.com>",
      to: ["contact@draftacademical.com"],
      subject: `New contact form message from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
    });

    if (error) {
      console.error("[contact] Failed to send email:", error);
      return NextResponse.json({ message: "Unable to send your message. Please try again later." }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[contact] Failed to send email:", error);
    return NextResponse.json({ message: "Unable to send your message. Please try again later." }, { status: 500 });
  }
}
