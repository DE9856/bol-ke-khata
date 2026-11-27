import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ShieldCheck } from "lucide-react";
import { upiLink } from "../lib/ledger.js";
import { Amount } from "../ui/kit.jsx";

// What the customer sees after tapping the link in a WhatsApp reminder: the amount, a button that
// opens their UPI app (GPay, PhonePe, Paytm, BHIM) with everything filled in, and a QR code to scan
// from another phone. Nothing is charged here; the payment happens inside the customer's UPI app.
export default function PayPage() {
  const q = new URLSearchParams(window.location.search);
  const to = q.get("to") || "";
  const shop = q.get("shop") || "Dukaan";
  const name = q.get("name") || "";
  const amount = Number(q.get("am") || 0);
  const valid = /^[\w.\-]+@[\w.\-]+$/.test(to) && amount > 0 && amount < 1e6;
  const link = valid ? upiLink(to, shop, amount, `${shop} udhaar${name ? ` - ${name}` : ""}`) : "";
  const [qr, setQr] = useState("");

  useEffect(() => {
    if (!link) return;
    QRCode.toDataURL(link, { margin: 1, width: 480, color: { dark: "#123326", light: "#FCFAF5" } }).then(setQr).catch(() => setQr(""));
  }, [link]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-paper-100 px-5 pb-8 pt-6">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-forest-700 font-serif text-[19px] font-semibold text-paper-50">ब</span>
        <div className="leading-tight">
          <div className="text-[15px] font-extrabold text-ink-900">{shop}</div>
          <div className="text-[11px] font-medium text-ink-500">Bol ke Khata se bheja gaya</div>
        </div>
      </div>
      {!valid ? (
        <div className="mt-8 rounded-[22px] bg-paper-50 p-5 text-[15px] text-ink-700 ring-1 ring-paper-300/60">
          Yeh payment link adhoora hai. This payment link is incomplete.
        </div>
      ) : (
        <>
          <section className="mt-8 text-center">
            {name && <div className="font-serif text-[20px] text-ink-700">Namaste {name},</div>}
            <div className="mt-1 text-[14px] text-ink-500">{shop} mein aapka baaki</div>
            <Amount value={amount} className="mt-2 block text-hero text-ink-900" />
          </section>
          <a href={link} className="mt-7 flex min-h-[56px] items-center justify-center rounded-2xl bg-forest-700 text-[16px] font-bold text-paper-50 shadow-mic active:scale-[0.99]">
            UPI se chukayein · Pay with UPI
          </a>
          <p className="mt-2 text-center text-[13px] text-ink-500">GPay, PhonePe, Paytm ya BHIM khulega, amount bhara hua.</p>

          <section className="mt-7 rounded-[24px] bg-paper-50 p-5 text-center ring-1 ring-paper-300/60">
            <div className="text-[13px] font-bold text-ink-700">Ya doosre phone se scan karein</div>
            {qr ? <img src={qr} alt={`UPI QR code to pay ${amount} rupees to ${to}`} className="mx-auto mt-3 w-52 rounded-xl" /> : <div className="mx-auto mt-3 h-52 w-52 animate-pulse rounded-xl bg-paper-200" />}
            <div className="mt-3 font-mono text-[14px] text-ink-700">{to}</div>
          </section>
          <p className="mt-5 flex items-center justify-center gap-1.5 text-[12px] text-ink-500">
            <ShieldCheck size={14} />Paisa seedha {shop} ke UPI mein jaata hai.
          </p>
        </>
      )}
    </div>
  );
}
