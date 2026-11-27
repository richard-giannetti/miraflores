import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { GuestCheckin } from "./components/GuestCheckin";
import { QuotePage } from "./components/QuotePage";
import "./design/tokens.css";
import "./styles.css";
import { applyTheme, savedTheme } from "./lib/theme";

// Before the first paint, so a pinned light or dark theme never flashes the other one.
applyTheme(savedTheme());

// Guests reach their check-in page through /c/<token> and their quote through /q/<token>; everything else is
// the back-office.
const guestToken = location.pathname.match(/^\/c\/([\w-]+)\/?$/)?.[1];
const quoteToken = location.pathname.match(/^\/q\/([\w-]+)\/?$/)?.[1];

createRoot(document.getElementById("root")!).render(
  <StrictMode>{guestToken ? <GuestCheckin token={guestToken} /> : quoteToken ? <QuotePage token={quoteToken} /> : <App />}</StrictMode>,
);

// Keep the app itself available offline (see public/sw.js).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
