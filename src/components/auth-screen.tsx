import { useState, type FormEvent } from "react";
import { BookOpen, Eye, EyeOff, LockKeyhole } from "lucide-react";

export type AuthScreenProps = {
  onLogin: (email: string, password: string) => void | Promise<void>;
  onCreateAccount: (email: string, password: string) => void | Promise<void>;
  busy: boolean;
  errorMessage?: string | null;
  statusMessage?: string | null;
  configured: boolean;
};

export function AuthScreen({
  onLogin,
  onCreateAccount,
  busy,
  errorMessage,
  statusMessage,
  configured,
}: AuthScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured || busy) return;

    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const submitAction = submitter?.dataset.authAction;
    if (submitAction === "create-account") {
      void onCreateAccount(email.trim(), password);
      return;
    }
    void onLogin(email.trim(), password);
  }

  return (
    <main className="auth-screen" aria-busy={busy}>
      <section className="auth-card" aria-labelledby="auth-brand">
        <header className="auth-brand-block">
          <div className="auth-brand-mark" aria-hidden="true">
            <BookOpen size={24} strokeWidth={2.3} />
          </div>
          <h1 className="auth-brand-name" id="auth-brand">BizRecord</h1>
          <p className="auth-slogan">Better Business Record, Better Growth.</p>
        </header>

        <div className="auth-welcome">
          <span className="auth-kicker">Your shop, in good hands</span>
          <h2>Welcome back</h2>
          <p>Sign in to keep your business records close.</p>
        </div>

        {!configured && (
          <div className="auth-message auth-configuration" role="status" data-testid="status-configuration">
            <LockKeyhole size={17} aria-hidden="true" />
            <p><strong>Sign-in setup is not complete.</strong> This project needs its Supabase project URL and publishable anon key before you can create an account or log in.</p>
          </div>
        )}

        {errorMessage && (
          <div className="auth-message auth-error" role="alert" data-testid="status-auth-error">
            <p>{errorMessage}</p>
          </div>
        )}
        {statusMessage && (
          <div className="auth-message auth-success" role="status" aria-live="polite" data-testid="status-auth-success">
            <p>{statusMessage}</p>
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit} aria-label="Sign in or create an account">
          <div className="auth-field">
            <label htmlFor="bizrecord-email">Email address</label>
            <input
              id="bizrecord-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
              data-testid="input-email"
            />
          </div>

          <div className="auth-field">
            <label htmlFor="bizrecord-password">Password</label>
            <div className="auth-password-wrap">
              <input
                id="bizrecord-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
                data-testid="input-password"
              />
              <button
                className="auth-password-toggle"
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                disabled={busy}
                data-testid="button-toggle-password"
              >
                {showPassword ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
              </button>
            </div>
          </div>

          <div className="auth-actions">
            <button
              className="auth-button auth-button-primary"
              type="submit"
              data-auth-action="login"
              disabled={busy || !configured}
              data-testid="button-login"
            >
              {busy ? <><span className="auth-button-pulse" aria-hidden="true" /> Please wait…</> : "Login to My Shop"}
            </button>
            <button
              className="auth-button auth-button-secondary"
              type="submit"
              data-auth-action="create-account"
              disabled={busy || !configured}
              data-testid="button-create-account"
            >
              Create Account
            </button>
          </div>
          {busy && <span className="auth-sr-only" role="status" aria-live="polite" data-testid="status-auth-busy">Signing you in. Please wait.</span>}
        </form>

        <footer className="auth-footer">
          <LockKeyhole size={14} aria-hidden="true" />
          <span>{configured ? 'Secure & Private — Only you see your shop' : 'Secure sign-in will be available after Supabase is connected.'}</span>
        </footer>
      </section>
    </main>
  );
}

export default AuthScreen;
