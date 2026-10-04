"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EntryShell } from "../../components/nexride/entry";
import {
  Button,
  InputField,
  StatusBanner,
  useTranslation,
} from "../../components/nexride/ui";
import { supabase } from "../../lib/supabase";
import {
  enterRider,
  ONBOARDING_KEY,
  PREVIEW_ENABLED_KEY,
} from "../../lib/nexride-startup";
import "../nexride.css";
export default function Authentication() {
  return (
    <EntryShell>
      <SignIn />
    </EntryShell>
  );
}
function SignIn() {
  const t = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (active && !error && data.session) {
          enterRider(data.session);
          router.replace("/");
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [router]);
  const preview = () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, "true");
      localStorage.setItem(PREVIEW_ENABLED_KEY, "true");
    } catch {}
    enterRider(null);
    router.replace("/");
  };
  return (
    <>
      <h1>{t("signIn")}</h1>
      <p>{t("signInIntro")}</p>
      <form
        className="nr-profile-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError(false);
          try {
            const { data, error } = await supabase.auth.signInWithPassword({
              email: email.trim(),
              password,
            });
            if (error || !data.session) {
              setError(true);
              return;
            }
            setPassword("");
            try {
              localStorage.setItem(ONBOARDING_KEY, "true");
              localStorage.removeItem(PREVIEW_ENABLED_KEY);
            } catch {}
            enterRider(data.session);
            router.replace("/");
          } catch {
            setError(true);
          } finally {
            setBusy(false);
          }
        }}
      >
        <InputField
          label={t("authEmail")}
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <InputField
          label={t("password")}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p className="nr-auth-error" role="alert">
            {t("authFailure")}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {t(busy ? "signingIn" : "signIn")}
        </Button>
      </form>
      <StatusBanner>{t("previewInfo")}</StatusBanner>
      <Button variant="ghost" onClick={preview} disabled={busy}>
        {t("explorePreview")}
      </Button>
    </>
  );
}
