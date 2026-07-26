import { KeyRound, LockKeyhole, ShieldCheck, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAdmin } from '../../cms/AdminContext';
import { cmsConfiguration } from '../../cms/supabaseClient';

export function AdminLoginDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { loginOpen, closeLogin, login, isBusy, error, clearError, status } = useAdmin();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (loginOpen && !dialog.open) {
      dialog.showModal();
      window.setTimeout(() => usernameRef.current?.focus(), 0);
    } else if (!loginOpen && dialog.open) {
      dialog.close();
    }
  }, [loginOpen]);

  const dismiss = () => {
    setPassword('');
    clearError();
    closeLogin();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await login(username, password);
  };

  const isConfigured = status !== 'unconfigured' && cmsConfiguration.isConfigured;

  return (
    <dialog
      ref={dialogRef}
      className="admin-login"
      aria-labelledby="admin-login-title"
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClose={dismiss}
    >
      <button
        className="admin-login__close icon-button"
        type="button"
        aria-label="Close administrator login"
        onClick={dismiss}
      >
        <X aria-hidden="true" />
      </button>

      <div className="admin-login__mark" aria-hidden="true">
        <ShieldCheck />
      </div>
      <p className="eyebrow">Restricted access</p>
      <h2 id="admin-login-title">Administrator login</h2>
      <p className="admin-login__intro">
        Sign in to manage verified website content. Public visitors cannot create accounts or edit
        records.
      </p>

      {isConfigured ? (
        <form onSubmit={submit} noValidate>
          <label>
            <span>Username</span>
            <span className="admin-login__input">
              <KeyRound aria-hidden="true" size={18} />
              <input
                ref={usernameRef}
                type="text"
                autoComplete="username"
                value={username}
                required
                onChange={(event) => {
                  setUsername(event.target.value);
                  if (error) clearError();
                }}
              />
            </span>
          </label>
          <label>
            <span>Password</span>
            <span className="admin-login__input">
              <LockKeyhole aria-hidden="true" size={18} />
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                required
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (error) clearError();
                }}
              />
            </span>
          </label>

          {error ? (
            <p className="admin-login__error" role="alert">
              {error}
            </p>
          ) : null}

          <button
            className="button button--primary admin-login__submit"
            type="submit"
            disabled={isBusy || !username.trim() || !password}
          >
            {isBusy ? 'Checking access…' : 'Sign in securely'}
          </button>
        </form>
      ) : (
        <div className="admin-login__setup" role="status">
          <LockKeyhole aria-hidden="true" />
          <div>
            <strong>Administrator setup is not connected yet.</strong>
            <p>Add the Supabase project URL and publishable key to enable secure login.</p>
          </div>
        </div>
      )}

      <p className="admin-login__security">
        Authentication is validated by Supabase; no administrator password is stored in this site.
      </p>
    </dialog>
  );
}
