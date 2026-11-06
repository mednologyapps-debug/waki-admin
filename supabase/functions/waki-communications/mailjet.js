// Mailjet Send API v3.1: a successful response means accepted by Mailjet,
// not that the message has reached the recipient's inbox.
const ENDPOINT = "https://api.mailjet.com/v3.1/send";

export function mailjetPayload(row, message, fromAddress, fromName = "WAKI") {
  const from = String(fromAddress || "").trim();
  const email = from.includes("<")
    ? from.match(/<([^<>]+)>/)?.[1]?.trim()
    : from;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("INVALID_SENDER");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(row.recipient || ""))) {
    throw new Error("INVALID_RECIPIENT");
  }
  return {
    Messages: [{
      From: { Email: email, Name: fromName || "WAKI" },
      To: [{ Email: row.recipient }],
      Subject: message.subject,
      TextPart: message.text,
      HTMLPart: message.html,
      CustomID: "waki-notice-" + row.id,
    }],
  };
}

export async function sendMailjet({ apiKey, secretKey, row, message, fromAddress, fromName, fetcher = fetch }) {
  const payload = mailjetPayload(row, message, fromAddress, fromName);
  const response = await fetcher(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(apiKey + ":" + secretKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  let result = null;
  try { result = await response.json(); } catch { /* Unexpected provider body: manual review. */ }
  const item = result?.Messages?.[0];
  if (response.ok && item?.Status === "success" && item.To?.length) {
    return {
      state: "sent",
      error_code: "",
      provider_message_id: String(item.To[0]?.MessageUUID || item.To[0]?.MessageID || "").slice(0,96),
    };
  }
  const uncertain = response.status === 429 || response.status >= 500 || (response.ok && !item);
  return {
    state: uncertain ? "unknown" : "failed",
    error_code: "MAILJET_HTTP_" + response.status,
    provider_message_id: "",
  };
}
