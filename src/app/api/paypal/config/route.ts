import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const mode = process.env.PAYPAL_MODE || "sandbox";

  if (!clientId || clientId === "your_paypal_client_id") {
    return NextResponse.json(
      { error: "PayPal is not configured" },
      { status: 503 }
    );
  }

  return NextResponse.json({ clientId, mode });
}
