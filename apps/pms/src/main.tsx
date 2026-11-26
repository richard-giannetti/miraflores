import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { GuestCheckin } from "./components/GuestCheckin";
import "@fontsource-variable/inter";
import "./styles.css";

// Guests reach their check-in page through /c/<token>; everything else is the back-office.
const guestToken = location.pathname.match(/^\/c\/([\w-]+)\/?$/)?.[1];

createRoot(document.getElementById("root")!).render(<StrictMode>{guestToken ? <GuestCheckin token={guestToken} /> : <App />}</StrictMode>);

// Keep the app itself available offline (see public/sw.js).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
