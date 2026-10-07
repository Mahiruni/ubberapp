"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../../components/nexride/ui";
import { DriverBottomNav, usePersistedDriverTheme } from "../../../components/nexride/driver-app-shell";
import { useOperationalTranslation } from "../../../components/nexride/operational-i18n";
import { supabase } from "../../../lib/supabase";
import {
  formatRideStatus,
  isRideChatActive,
  loadParticipantRide,
  loadRideMessages,
  type RideMessage,
  type RiderRide,
} from "../../../lib/nexride-rider-support";
import "../../nexride.css";
import "../../rider/supporting.css";
import "../../detail-system.css";

type PendingMessage = {
  clientId: string;
  body: string;
  status: "sending" | "failed";
};

export default function TripChatPage() {
  const router = useRouter();
  const op = useOperationalTranslation();
  const driverTheme = usePersistedDriverTheme();
  const threadRef = useRef<HTMLDivElement>(null);
  const [ride, setRide] = useState<RiderRide | null>(null);
  const [messages, setMessages] = useState<RideMessage[]>([]);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [userId, setUserId] = useState("");
  const [otherName, setOtherName] = useState("Trip participant");
  const [otherPhone, setOtherPhone] = useState("");
  const [role, setRole] = useState<"rider" | "driver">("rider");
  const [offerId, setOfferId] = useState("");
  const [text, setText] = useState("");
  const [draftKey, setDraftKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rideId = params.get("ride") || "";
    const nextDraftKey = rideId ? "nexride.trip.chat.draft." + rideId : "";
    setDraftKey(nextDraftKey);
    if (nextDraftKey) {
      try { setText(sessionStorage.getItem(nextDraftKey) || ""); } catch {}
    }
    const requestedRole = params.get("role") === "driver" ? "driver" : "rider";
    setRole(requestedRole);
    setOfferId(params.get("offer") || "");
    setOnline(navigator.onLine);

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!active) return;

      if (!session) {
        router.replace(requestedRole === "driver" ? "/driver/auth" : "/rider/sign-in");
        return;
      }

      if (!rideId) {
        setLoadError("No trip was provided for this conversation.");
        setLoading(false);
        return;
      }

      setUserId(session.user.id);

      try {
        const nextRide = await loadParticipantRide(rideId, session.user.id);
        if (!nextRide) throw new Error("This conversation is not available for your account.");
        if (!active) return;
        setRide(nextRide);

        const otherId = nextRide.riderId === session.user.id ? nextRide.driverId : nextRide.riderId;
        if (otherId) {
          const { data: other } = await supabase
            .from("profiles")
            .select("full_name,phone")
            .eq("id", otherId)
            .maybeSingle();

          if (active && other) {
            setOtherName(other.full_name || (requestedRole === "driver" ? "Rider" : "Driver"));
            setOtherPhone(other.phone || "");
          }
        }

        const nextMessages = await loadRideMessages(rideId);
        if (!active) return;
        setMessages(nextMessages);

        channel = supabase
          .channel("ride-chat:" + rideId)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "ride_chat_messages", filter: "ride_request_id=eq." + rideId },
            (payload) => {
              const row = payload.new as Record<string, unknown>;
              const incoming: RideMessage = {
                id: String(row.id || ""),
                rideRequestId: String(row.ride_request_id || ""),
                senderId: String(row.sender_id || ""),
                body: String(row.body || ""),
                createdAt: String(row.created_at || new Date().toISOString()),
              };
              setMessages((current) => current.some((message) => message.id === incoming.id) ? current : [...current, incoming]);
            },
          )
          .subscribe();
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : "Conversation unavailable.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [router]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  useEffect(() => {
    if (!draftKey) return;
    try {
      if (text) sessionStorage.setItem(draftKey, text);
      else sessionStorage.removeItem(draftKey);
    } catch {}
  }, [draftKey, text]);

  const back = () => {
    if (role === "driver" && offerId) {
      router.replace("/driver/navigation?offer=" + encodeURIComponent(offerId));
      return;
    }
    if (window.history.length > 1) router.back();
    else router.replace(role === "driver" ? "/driver/home" : "/");
  };

  async function send(body: string, reuseId?: string) {
    if (!ride || !userId || !isRideChatActive(ride)) return;
    const clean = body.trim().slice(0, 2000);
    if (!clean) return;

    const clientId = reuseId || crypto.randomUUID();
    setPending((current) => [
      ...current.filter((message) => message.clientId !== clientId),
      { clientId, body: clean, status: "sending" },
    ]);

    if (!online) {
      setPending((current) => current.map((message) => message.clientId === clientId ? { ...message, status: "failed" } : message));
      return;
    }

    const { data, error } = await supabase
      .from("ride_chat_messages")
      .insert({ ride_request_id: ride.id, body: clean, client_nonce: clientId })
      .select("id,ride_request_id,sender_id,body,created_at")
      .single();

    if (error || !data) {
      setPending((current) => current.map((message) => message.clientId === clientId ? { ...message, status: "failed" } : message));
      return;
    }

    setPending((current) => current.filter((message) => message.clientId !== clientId));
    setMessages((current) => current.some((message) => message.id === data.id) ? current : [...current, {
      id: data.id,
      rideRequestId: data.ride_request_id,
      senderId: data.sender_id,
      body: data.body,
      createdAt: data.created_at,
    }]);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    setText("");
    if (draftKey) {
      try { sessionStorage.removeItem(draftKey); } catch {}
    }
    void send(clean);
  }

  return (
    <main className="nr-app nr-support-page" data-theme={role === "driver" ? driverTheme.resolvedTheme : "dark"} data-mode={role}>
      <div className="nr-support-wrap">
        <header className="nr-support-head">
          <button className="nr-support-back" onClick={back} aria-label={op("Back")}>
            <Icon name="back" />
          </button>
          <div>
            <span className="kicker">NEXRIDE TRIP CHAT</span>
            <h1>{otherName}</h1>
            <p>{online ? op("Connected") : op("Offline · unsent messages can be retried")}</p>
          </div>
          {otherPhone ? (
            <a className="nr-support-icon-btn" href={"tel:" + otherPhone.replace(/[ ()-]/g, "")} aria-label={"Call " + otherName}>
              <Icon name="phone" />
            </a>
          ) : (
            <button className="nr-support-icon-btn" disabled aria-label="Call unavailable">
              <Icon name="phone" />
            </button>
          )}
        </header>

        {loading ? (
          <div className="nr-support-loading" aria-busy="true"><span /><span /><span /></div>
        ) : loadError || !ride ? (
          <section className="nr-support-state" role="alert">
            <span><Icon name="chat" size={22} /></span>
            <strong>{op("Conversation unavailable")}</strong>
            <p>{loadError || "This trip conversation could not be loaded."}</p>
            <button onClick={back}>Go back</button>
          </section>
        ) : (
          <>
            <section className="nr-support-card nr-chat-context">
              <div className="nr-chat-context-top">
                <div>
                  <small>{ride.category.toUpperCase()} · {formatRideStatus(ride.status).toUpperCase()}</small>
                  <strong>{op("Trip conversation")}</strong>
                </div>
                {otherPhone && (
                  <a className="nr-chat-call" href={"tel:" + otherPhone.replace(/[ ()-]/g, "")}>
                    <Icon name="phone" size={15} /> {op("Call")}
                  </a>
                )}
              </div>
              <div className="nr-chat-route">
                <span>{ride.pickup}</span>
                <Icon name="chevron" size={14} />
                <span>{ride.destination}</span>
              </div>
            </section>

            <div className="nr-chat-thread" ref={threadRef} aria-live="polite" aria-label={op("Trip messages")}>
              {!messages.length && !pending.length ? (
                <div className="nr-chat-empty">
                  {op("No messages yet. Use chat for trip coordination. NexRide does not currently provide typing indicators, delivery receipts, or read receipts.")}
                </div>
              ) : (
                <>
                  {messages.map((message) => (
                    <article className={"nr-chat-bubble" + (message.senderId === userId ? " mine" : "")} key={message.id}>
                      <p>{message.body}</p>
                      <footer>
                        <time>{new Date(message.createdAt).toLocaleTimeString("en-ET", { hour: "numeric", minute: "2-digit" })}</time>
                        {message.senderId === userId && <span>Sent</span>}
                      </footer>
                    </article>
                  ))}
                  {pending.map((message) => (
                    <article className={"nr-chat-bubble mine" + (message.status === "failed" ? " failed" : "")} key={message.clientId}>
                      <p>{message.body}</p>
                      <footer>
                        <span>{message.status === "sending" ? op("Sending…") : op("Failed")}</span>
                        {message.status === "failed" && <button onClick={() => void send(message.body, message.clientId)}>{op("Retry")}</button>}
                      </footer>
                    </article>
                  ))}
                </>
              )}
            </div>

            <form className="nr-chat-composer" onSubmit={submit}>
              <textarea
                value={text}
                maxLength={2000}
                rows={1}
                placeholder={isRideChatActive(ride) ? op("Message your trip participant…") : op("Chat is read-only after the active trip ends.")}
                aria-label={op("Trip message")}
                disabled={!isRideChatActive(ride)}
                onChange={(event) => setText(event.target.value)}
              />
              <button type="submit" disabled={!text.trim() || !isRideChatActive(ride)} aria-label={op("Send message")}>
                <Icon name="arrow" size={19} />
              </button>
            </form>
          </>
        )}
      </div>
      {role === "driver" && <DriverBottomNav activeOverride="messages" subdued />}
    </main>
  );
}
