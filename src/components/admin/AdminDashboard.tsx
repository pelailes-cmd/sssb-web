import {
  BookOpenText,
  ChevronDown,
  ChevronUp,
  CircleUserRound,
  FileText,
  Image,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Megaphone,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useAdmin } from '../../cms/AdminContext';
import {
  deleteContentItem,
  fetchAdminContent,
  initializeStaticContent,
  saveContentItem,
  updateContentOrder,
} from '../../cms/contentRepository';
import { useSiteContent } from '../../cms/SiteContentContext';
import {
  contentTypeLabels,
  contentTypes,
  type CmsSnapshot,
  type ContentData,
  type ContentType,
  type ManagedContentItem,
} from '../../cms/types';
import { ContentEditor } from './ContentEditor';

const typeIcons = {
  products: Package,
  promotions: Megaphone,
  portfolio: Image,
  services: Wrench,
  documents: FileText,
  about: BookOpenText,
} satisfies Record<ContentType, typeof Package>;

const emptySnapshot = (): CmsSnapshot => ({ collections: new Set(), items: [] });

function itemTitle(item: ManagedContentItem) {
  const data = item.data as unknown as Record<string, unknown>;
  return typeof data.title === 'string'
    ? data.title
    : typeof data.name === 'string'
      ? data.name
      : item.slug;
}

function PasswordPanel({ onDone }: { onDone: () => void }) {
  const { changePassword } = useAdmin();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    if (password.length < 12) {
      setError('Use at least 12 characters for the new password.');
      return;
    }
    if (password !== confirmation) {
      setError('The password confirmation does not match.');
      return;
    }

    setIsSaving(true);
    try {
      await changePassword(password);
      setPassword('');
      setConfirmation('');
      setSuccess(true);
    } catch (changeError) {
      setError(
        changeError instanceof Error ? changeError.message : 'The password was not changed.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="admin-security-panel" aria-labelledby="admin-security-title">
      <div className="admin-security-panel__mark">
        <LockKeyhole aria-hidden="true" />
      </div>
      <p className="eyebrow">Account security</p>
      <h3 id="admin-security-title">Change administrator password</h3>
      <p>
        Replace the temporary seed password after the first successful login. The new value is sent
        directly to Supabase Auth and is never stored in the website repository.
      </p>
      <form onSubmit={submit}>
        <label>
          <span>New password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            required
            minLength={12}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label>
          <span>Confirm new password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmation}
            required
            minLength={12}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        {success ? <p role="status">Password updated successfully.</p> : null}
        <div>
          <button className="button button--ghost" type="button" onClick={onDone}>
            Back to content
          </button>
          <button className="button button--primary" type="submit" disabled={isSaving}>
            {isSaving ? (
              <LoaderCircle className="is-spinning" aria-hidden="true" />
            ) : (
              <Save aria-hidden="true" />
            )}
            {isSaving ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </form>
    </section>
  );
}

export function AdminDashboard() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { dashboardOpen, closeDashboard, profile, isAdmin, logout, isBusy: authBusy } = useAdmin();
  const { refresh: refreshPublicContent } = useSiteContent();
  const [selectedType, setSelectedType] = useState<ContentType>('products');
  const [snapshot, setSnapshot] = useState<CmsSnapshot>(emptySnapshot);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<ManagedContentItem | null | undefined>(undefined);
  const [securityOpen, setSecurityOpen] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setIsLoading(true);
    setError(null);
    try {
      setSnapshot(await fetchAdminContent());
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'The managed content could not be loaded.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (dashboardOpen && isAdmin && !dialog.open) {
      dialog.showModal();
      void load();
    } else if ((!dashboardOpen || !isAdmin) && dialog.open) {
      dialog.close();
    }
  }, [dashboardOpen, isAdmin, load]);

  const dismissDashboard = useCallback(() => {
    setEditing(undefined);
    setSecurityOpen(false);
    setNotice(null);
    closeDashboard();
  }, [closeDashboard]);

  const currentItems = useMemo(
    () =>
      snapshot.items
        .filter((item) => item.contentType === selectedType)
        .sort((a, b) => a.position - b.position),
    [selectedType, snapshot.items],
  );

  const initializedCount = snapshot.collections.size;
  const canAdd = selectedType !== 'about' || currentItems.length === 0;

  const synchronize = useCallback(async () => {
    await load();
    await refreshPublicContent();
  }, [load, refreshPublicContent]);

  const initialize = async () => {
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      setSnapshot(await initializeStaticContent());
      await refreshPublicContent();
      setNotice('Current verified website content is now managed by the database.');
    } catch (initializeError) {
      setError(
        initializeError instanceof Error
          ? initializeError.message
          : 'The current website content could not be imported.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const save = async (data: ContentData, isPublished: boolean) => {
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      await saveContentItem({
        recordId: editing?.recordId,
        contentType: selectedType,
        data,
        position: editing?.position ?? currentItems.length,
        isPublished,
      });
      setEditing(undefined);
      await synchronize();
      setNotice(`${contentTypeLabels[selectedType]} updated successfully.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The content could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (item: ManagedContentItem) => {
    const confirmed = window.confirm(
      `Remove “${itemTitle(item)}”? This removes the record from the website but does not delete shared uploaded files.`,
    );
    if (!confirmed) return;

    setIsSaving(true);
    setError(null);
    try {
      await deleteContentItem(item.recordId);
      await synchronize();
      setNotice('Content removed successfully.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'The content was not removed.');
    } finally {
      setIsSaving(false);
    }
  };

  const togglePublished = async (item: ManagedContentItem) => {
    setIsSaving(true);
    setError(null);
    try {
      await saveContentItem({
        recordId: item.recordId,
        contentType: item.contentType,
        data: item.data,
        position: item.position,
        isPublished: !item.isPublished,
      });
      await synchronize();
      setNotice(item.isPublished ? 'Content moved to drafts.' : 'Content published.');
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? publishError.message
          : 'The publication status was not changed.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= currentItems.length) return;
    const reordered = [...currentItems];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

    setIsSaving(true);
    setError(null);
    try {
      await updateContentOrder(
        reordered.map((item, position) => ({ recordId: item.recordId, position })),
      );
      await synchronize();
      setNotice('Display order updated.');
    } catch (orderError) {
      setError(
        orderError instanceof Error ? orderError.message : 'The display order was not saved.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="admin-dashboard"
      aria-labelledby="admin-dashboard-title"
      onCancel={(event) => {
        event.preventDefault();
        dismissDashboard();
      }}
      onClose={dismissDashboard}
    >
      <div className="admin-dashboard__shell">
        <aside className="admin-sidebar">
          <div className="admin-sidebar__brand">
            <span>
              <LayoutDashboard aria-hidden="true" />
            </span>
            <div>
              <strong>Website Admin</strong>
              <small>Smart Save Solar Bicol</small>
            </div>
          </div>

          <nav aria-label="Managed website sections">
            {contentTypes.map((type) => {
              const Icon = typeIcons[type];
              const count = snapshot.items.filter((item) => item.contentType === type).length;
              return (
                <button
                  key={type}
                  type="button"
                  className={selectedType === type && !securityOpen ? 'is-active' : ''}
                  aria-current={selectedType === type && !securityOpen ? 'page' : undefined}
                  onClick={() => {
                    setSelectedType(type);
                    setEditing(undefined);
                    setSecurityOpen(false);
                    setError(null);
                  }}
                >
                  <Icon aria-hidden="true" />
                  <span>{contentTypeLabels[type]}</span>
                  <small>{count}</small>
                </button>
              );
            })}
          </nav>

          <div className="admin-sidebar__account">
            <div>
              <CircleUserRound aria-hidden="true" />
              <span>
                <strong>{profile?.username}</strong>
                <small>Administrator</small>
              </span>
            </div>
            <button
              type="button"
              className={securityOpen ? 'is-active' : ''}
              onClick={() => {
                setSecurityOpen(true);
                setEditing(undefined);
              }}
            >
              <Settings2 aria-hidden="true" />
              Security
            </button>
            <button type="button" disabled={authBusy} onClick={() => void logout()}>
              <LogOut aria-hidden="true" />
              Sign out
            </button>
          </div>
        </aside>

        <div className="admin-workspace">
          <header className="admin-workspace__header">
            <div>
              <p className="eyebrow">Content manager</p>
              <h2 id="admin-dashboard-title">
                {securityOpen ? 'Account security' : contentTypeLabels[selectedType]}
              </h2>
            </div>
            <div>
              {!securityOpen && editing === undefined && canAdd ? (
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => setEditing(null)}
                >
                  <Plus aria-hidden="true" />
                  Add new
                </button>
              ) : null}
              <button
                className="icon-button"
                type="button"
                aria-label="Close administrator dashboard"
                onClick={dismissDashboard}
              >
                <X aria-hidden="true" />
              </button>
            </div>
          </header>

          <main className="admin-workspace__main">
            {error && editing === undefined ? (
              <div className="admin-notice admin-notice--error" role="alert">
                <strong>Something needs attention</strong>
                <p>{error}</p>
              </div>
            ) : null}
            {notice && editing === undefined ? (
              <div className="admin-notice" role="status">
                <strong>Saved</strong>
                <p>{notice}</p>
              </div>
            ) : null}

            {securityOpen ? (
              <PasswordPanel onDone={() => setSecurityOpen(false)} />
            ) : editing !== undefined ? (
              <ContentEditor
                key={editing?.recordId ?? `new-${selectedType}`}
                contentType={selectedType}
                item={editing}
                isSaving={isSaving}
                saveError={error}
                onCancel={() => {
                  setEditing(undefined);
                  setError(null);
                }}
                onSave={save}
              />
            ) : (
              <>
                <div className="admin-collection-summary">
                  <div>
                    <strong>{currentItems.length}</strong>
                    <span>Total records</span>
                  </div>
                  <div>
                    <strong>{currentItems.filter((item) => item.isPublished).length}</strong>
                    <span>Published</span>
                  </div>
                  <div>
                    <strong>{currentItems.filter((item) => !item.isPublished).length}</strong>
                    <span>Drafts</span>
                  </div>
                  <button type="button" disabled={isLoading} onClick={() => void load()}>
                    <RefreshCw className={isLoading ? 'is-spinning' : ''} aria-hidden="true" />
                    Refresh
                  </button>
                </div>

                {initializedCount < contentTypes.length ? (
                  <section className="admin-bootstrap">
                    <span>
                      <LayoutDashboard aria-hidden="true" />
                    </span>
                    <div>
                      <p className="eyebrow">First-time setup</p>
                      <h3>Bring the current verified website content into the dashboard.</h3>
                      <p>
                        This initializes only collections that have not been managed yet. Existing
                        database records are preserved.
                      </p>
                    </div>
                    <button
                      className="button button--primary"
                      type="button"
                      disabled={isSaving}
                      onClick={() => void initialize()}
                    >
                      {isSaving ? (
                        <LoaderCircle className="is-spinning" aria-hidden="true" />
                      ) : (
                        <Save aria-hidden="true" />
                      )}
                      Initialize content
                    </button>
                  </section>
                ) : null}

                {isLoading ? (
                  <div className="admin-loading" role="status">
                    <LoaderCircle className="is-spinning" aria-hidden="true" />
                    Loading managed content…
                  </div>
                ) : currentItems.length ? (
                  <div className="admin-record-list">
                    {currentItems.map((item, index) => (
                      <article key={item.recordId}>
                        <div className="admin-record-list__order">
                          <button
                            type="button"
                            disabled={index === 0 || isSaving}
                            aria-label={`Move ${itemTitle(item)} up`}
                            onClick={() => void move(index, -1)}
                          >
                            <ChevronUp aria-hidden="true" />
                          </button>
                          <span>{String(index + 1).padStart(2, '0')}</span>
                          <button
                            type="button"
                            disabled={index === currentItems.length - 1 || isSaving}
                            aria-label={`Move ${itemTitle(item)} down`}
                            onClick={() => void move(index, 1)}
                          >
                            <ChevronDown aria-hidden="true" />
                          </button>
                        </div>
                        <div className="admin-record-list__copy">
                          <div>
                            <span className={item.isPublished ? 'is-published' : 'is-draft'}>
                              {item.isPublished ? 'Published' : 'Draft'}
                            </span>
                            <small>{item.slug}</small>
                          </div>
                          <h3>{itemTitle(item)}</h3>
                          <p>Updated {new Date(item.updatedAt).toLocaleString('en-PH')}</p>
                        </div>
                        <div className="admin-record-list__actions">
                          <button type="button" onClick={() => void togglePublished(item)}>
                            {item.isPublished ? 'Unpublish' : 'Publish'}
                          </button>
                          <button type="button" onClick={() => setEditing(item)}>
                            <Pencil aria-hidden="true" />
                            Edit
                          </button>
                          <button
                            className="is-danger"
                            type="button"
                            onClick={() => void remove(item)}
                          >
                            <Trash2 aria-hidden="true" />
                            Remove
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="admin-empty">
                    <FileText aria-hidden="true" />
                    <h3>No managed {contentTypeLabels[selectedType].toLowerCase()} yet.</h3>
                    <p>Add a verified record when the source information is ready.</p>
                    {canAdd ? (
                      <button
                        className="button button--primary"
                        type="button"
                        onClick={() => setEditing(null)}
                      >
                        <Plus aria-hidden="true" />
                        Add first record
                      </button>
                    ) : null}
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </dialog>
  );
}
