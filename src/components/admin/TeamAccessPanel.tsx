import {
  KeyRound,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserRoundCog,
  UsersRound,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  createTeamMember,
  deleteTeamMember,
  listTeamMembers,
  resetTeamMemberPassword,
  type TeamMember,
} from '../../cms/teamRepository';

const usernamePattern = /^[a-z][a-z0-9._-]{2,39}$/;

export function TeamAccessPanel({ currentUserId }: { currentUserId: string }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [resettingMember, setResettingMember] = useState<TeamMember | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmation, setResetConfirmation] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setMembers(await listTeamMembers());
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Team accounts could not be loaded.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const request = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(request);
  }, [load]);

  const submitNewMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!usernamePattern.test(username)) {
      setError(
        'Use 3-40 lowercase letters, numbers, dots, hyphens, or underscores, beginning with a letter.',
      );
      return;
    }
    if (password.length < 12 || password.length > 128) {
      setError('The temporary password must contain 12-128 characters.');
      return;
    }
    if (password !== confirmation) {
      setError('The temporary-password confirmation does not match.');
      return;
    }

    setIsSaving(true);
    try {
      const member = await createTeamMember(username, password);
      setMembers((current) => [...current, member]);
      setUsername('');
      setPassword('');
      setConfirmation('');
      setNotice(
        `Account "${member.username}" was created. Share its temporary credentials securely.`,
      );
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'The coworker account was not created.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const submitPasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resettingMember) return;
    setError(null);
    setNotice(null);
    if (resetPassword.length < 12 || resetPassword.length > 128) {
      setError('The temporary password must contain 12-128 characters.');
      return;
    }
    if (resetPassword !== resetConfirmation) {
      setError('The temporary-password confirmation does not match.');
      return;
    }

    setIsSaving(true);
    try {
      await resetTeamMemberPassword(resettingMember.userId, resetPassword);
      setNotice(`Temporary password updated for "${resettingMember.username}".`);
      setResettingMember(null);
      setResetPassword('');
      setResetConfirmation('');
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'The password was not updated.');
    } finally {
      setIsSaving(false);
    }
  };

  const removeMember = async (member: TeamMember) => {
    const confirmed = window.confirm(
      `Remove coworker "${member.username}"? They will immediately lose administrator access.`,
    );
    if (!confirmed) return;

    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      await deleteTeamMember(member.userId);
      setMembers((current) => current.filter((item) => item.userId !== member.userId));
      setNotice(`Account "${member.username}" was removed.`);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'The coworker account was not removed.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="admin-team-panel" aria-labelledby="admin-team-title">
      <div className="admin-team-intro">
        <span>
          <UsersRound aria-hidden="true" />
        </span>
        <div>
          <p className="eyebrow">Owner controls</p>
          <h3 id="admin-team-title">Coworker access</h3>
          <p>
            Create individual content-manager accounts instead of sharing the owner password.
            Coworkers can manage website content, but only the owner can manage accounts.
          </p>
        </div>
      </div>

      {error ? (
        <div className="admin-notice admin-notice--error" role="alert">
          <strong>Team access needs attention</strong>
          <p>{error}</p>
        </div>
      ) : null}
      {notice ? (
        <div className="admin-notice" role="status">
          <strong>Team access updated</strong>
          <p>{notice}</p>
        </div>
      ) : null}

      <div className="admin-team-layout">
        <form className="admin-team-create" onSubmit={submitNewMember} noValidate>
          <div>
            <span>
              <Plus aria-hidden="true" />
            </span>
            <div>
              <h4>Create coworker account</h4>
              <p>Use a unique username and a temporary password you can share privately.</p>
            </div>
          </div>
          <label>
            <span>Username</span>
            <input
              value={username}
              required
              minLength={3}
              maxLength={40}
              pattern="[a-z][a-z0-9._-]{2,39}"
              autoComplete="off"
              placeholder="coworker.name"
              onChange={(event) =>
                setUsername(event.target.value.toLowerCase().replace(/\s+/g, ''))
              }
            />
            <small>Begins with a letter; lowercase letters, numbers, dots, hyphens, and _.</small>
          </label>
          <label>
            <span>Temporary password</span>
            <input
              type="password"
              value={password}
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label>
            <span>Confirm temporary password</span>
            <input
              type="password"
              value={confirmation}
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>
          <button className="button button--primary" type="submit" disabled={isSaving}>
            {isSaving ? (
              <LoaderCircle className="is-spinning" aria-hidden="true" />
            ) : (
              <UserRoundCog aria-hidden="true" />
            )}
            Create account
          </button>
        </form>

        <div className="admin-team-list">
          <div className="admin-team-list__header">
            <div>
              <h4>Authorized accounts</h4>
              <p>
                {members.length} account{members.length === 1 ? '' : 's'} with CMS access
              </p>
            </div>
            <button type="button" disabled={isLoading || isSaving} onClick={() => void load()}>
              <RefreshCw className={isLoading ? 'is-spinning' : ''} aria-hidden="true" />
              Refresh
            </button>
          </div>

          {isLoading ? (
            <div className="admin-loading" role="status">
              <LoaderCircle className="is-spinning" aria-hidden="true" />
              Loading team access...
            </div>
          ) : (
            <div className="admin-team-list__records">
              {members.map((member) => {
                const isOwner = member.role === 'owner';
                const isCurrent = member.userId === currentUserId;
                return (
                  <article key={member.userId}>
                    <span className={isOwner ? 'is-owner' : ''}>
                      {isOwner ? (
                        <ShieldCheck aria-hidden="true" />
                      ) : (
                        <UserRoundCog aria-hidden="true" />
                      )}
                    </span>
                    <div>
                      <div>
                        <h5>{member.username}</h5>
                        <small>{isOwner ? 'Owner' : 'Content manager'}</small>
                        {isCurrent ? <em>Current account</em> : null}
                      </div>
                      <p>
                        Added{' '}
                        {new Date(member.createdAt).toLocaleDateString('en-PH', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                    {!isOwner && !isCurrent ? (
                      <div className="admin-team-list__actions">
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => {
                            setResettingMember(member);
                            setResetPassword('');
                            setResetConfirmation('');
                            setError(null);
                          }}
                        >
                          <KeyRound aria-hidden="true" />
                          Reset password
                        </button>
                        <button
                          className="is-danger"
                          type="button"
                          disabled={isSaving}
                          onClick={() => void removeMember(member)}
                        >
                          <Trash2 aria-hidden="true" />
                          Remove
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {resettingMember ? (
        <form className="admin-team-reset" onSubmit={submitPasswordReset} noValidate>
          <div>
            <KeyRound aria-hidden="true" />
            <div>
              <p className="eyebrow">Password assistance</p>
              <h4>Set a temporary password for {resettingMember.username}</h4>
            </div>
            <button
              type="button"
              aria-label="Cancel password reset"
              onClick={() => setResettingMember(null)}
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <label>
            <span>New temporary password</span>
            <input
              type="password"
              value={resetPassword}
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              onChange={(event) => setResetPassword(event.target.value)}
            />
          </label>
          <label>
            <span>Confirm temporary password</span>
            <input
              type="password"
              value={resetConfirmation}
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              onChange={(event) => setResetConfirmation(event.target.value)}
            />
          </label>
          <button className="button button--primary" type="submit" disabled={isSaving}>
            {isSaving ? (
              <LoaderCircle className="is-spinning" aria-hidden="true" />
            ) : (
              <KeyRound aria-hidden="true" />
            )}
            Update temporary password
          </button>
        </form>
      ) : null}
    </section>
  );
}
