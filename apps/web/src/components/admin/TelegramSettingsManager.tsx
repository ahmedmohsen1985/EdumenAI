'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { TelegramConfigView, TelegramTargetView } from '@edumenai/shared';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit3,
  Eye,
  EyeOff,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  X
} from 'lucide-react';
import {
  ADMIN_SETTINGS_CACHE_KEYS,
  createTelegramTarget,
  deleteTelegramTarget,
  fetchTelegramSettings,
  saveTelegramConfig,
  sendTelegramTest,
  updateTelegramTarget,
  type TelegramSettingsData,
  type TelegramTestMessageResult
} from '../../lib/admin-settings-api';
import { getCached, isCacheFresh } from '../../lib/client-cache';

function configSourceLabel(source: TelegramConfigView['source']): string {
  if (source === 'database') return 'Database (Encrypted)';
  if (source === 'env') return '.env Fallback';
  return 'Not Configured';
}

function configSourceBadgeClasses(source: TelegramConfigView['source']): string {
  if (source === 'database') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (source === 'env') return 'bg-sky-50 text-sky-700 border-sky-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
}

export function TelegramSettingsManager(): React.ReactElement {
  const cachedTg = getCached<TelegramSettingsData>(ADMIN_SETTINGS_CACHE_KEYS.telegram);

  const [config, setConfig] = useState<TelegramConfigView | null>(cachedTg?.config ?? null);
  const [targets, setTargets] = useState<TelegramTargetView[]>(cachedTg?.targets ?? []);
  const [isLoading, setIsLoading] = useState<boolean>(cachedTg === null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // BotFather credentials state
  const [botTokenInput, setBotTokenInput] = useState<string>('');
  const [showBotToken, setShowBotToken] = useState<boolean>(false);
  const [isBotEnabled, setIsBotEnabled] = useState<boolean>(cachedTg?.config.isEnabled ?? false);
  const [isSavingBot, setIsSavingBot] = useState<boolean>(false);
  const [botStatus, setBotStatus] = useState<{ ok: boolean; message: string } | null>(null);

  // Add target form state
  const [newName, setNewName] = useState<string>('');
  const [newChatId, setNewChatId] = useState<string>('');
  const [newDescription, setNewDescription] = useState<string>('');
  const [newIsDefault, setNewIsDefault] = useState<boolean>(false);
  const [newIsActive, setNewIsActive] = useState<boolean>(true);
  const [isCreatingTarget, setIsCreatingTarget] = useState<boolean>(false);
  const [createTargetError, setCreateTargetError] = useState<string | null>(null);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editChatId, setEditChatId] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editIsDefault, setEditIsDefault] = useState<boolean>(false);
  const [editIsActive, setEditIsActive] = useState<boolean>(true);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  // Per-target test & delete confirmation state
  const [testingTargetId, setTestingTargetId] = useState<string | null>(null);
  const [targetTestResults, setTargetTestResults] = useState<
    Record<string, TelegramTestMessageResult>
  >({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Quick custom test state
  const [customTestChatId, setCustomTestChatId] = useState<string>('');
  const [customTestMessage, setCustomTestMessage] = useState<string>('');
  const [isSendingCustomTest, setIsSendingCustomTest] = useState<boolean>(false);
  const [customTestResult, setCustomTestResult] = useState<TelegramTestMessageResult | null>(null);

  // Collapsible BotFather guide
  const [showSetupGuide, setShowSetupGuide] = useState<boolean>(false);

  const loadSettings = useCallback(async (options?: { silent?: boolean; force?: boolean }) => {
    if (!options?.silent) {
      setIsLoading(true);
    }
    setLoadError(null);
    try {
      const data = await fetchTelegramSettings({ force: options?.force });
      setConfig(data.config);
      setIsBotEnabled(data.config.isEnabled);
      setTargets(data.targets);
    } catch (err: unknown) {
      if (!options?.silent) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load Telegram settings.');
      }
    } finally {
      if (!options?.silent) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const cached = getCached<TelegramSettingsData>(ADMIN_SETTINGS_CACHE_KEYS.telegram);
    if (cached && isCacheFresh(ADMIN_SETTINGS_CACHE_KEYS.telegram, 30_000)) {
      setIsLoading(false);
      return;
    }
    void loadSettings({ silent: cached !== null });
  }, [loadSettings]);

  const handleSaveBotConfig = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setIsSavingBot(true);
    setBotStatus(null);
    try {
      const trimmedToken = botTokenInput.trim();
      const updated = await saveTelegramConfig({
        ...(trimmedToken ? { botToken: trimmedToken } : {}),
        isEnabled: isBotEnabled
      });
      setConfig(updated);
      setIsBotEnabled(updated.isEnabled);
      setBotTokenInput('');
      setBotStatus({ ok: true, message: 'BotFather settings saved.' });
    } catch (err: unknown) {
      setBotStatus({
        ok: false,
        message: err instanceof Error ? err.message : 'Failed to save bot settings.'
      });
    } finally {
      setIsSavingBot(false);
    }
  };

  const handleCreateTarget = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!newName.trim() || !newChatId.trim()) {
      setCreateTargetError('Target name and Chat ID are required.');
      return;
    }

    setIsCreatingTarget(true);
    setCreateTargetError(null);
    try {
      await createTelegramTarget({
        name: newName.trim(),
        chatId: newChatId.trim(),
        ...(newDescription.trim() ? { description: newDescription.trim() } : {}),
        isDefault: newIsDefault,
        isActive: newIsActive
      });
      setNewName('');
      setNewChatId('');
      setNewDescription('');
      setNewIsDefault(false);
      setNewIsActive(true);
      await loadSettings();
    } catch (err: unknown) {
      setCreateTargetError(
        err instanceof Error ? err.message : 'Failed to create target group.'
      );
    } finally {
      setIsCreatingTarget(false);
    }
  };

  const startEditingTarget = (target: TelegramTargetView): void => {
    setEditingId(target.id);
    setEditName(target.name);
    setEditChatId(target.chatId);
    setEditDescription(target.description ?? '');
    setEditIsDefault(target.isDefault);
    setEditIsActive(target.isActive);
  };

  const handleSaveEdit = async (id: string): Promise<void> => {
    if (!editName.trim() || !editChatId.trim()) return;
    setIsSavingEdit(true);
    try {
      await updateTelegramTarget(id, {
        name: editName.trim(),
        chatId: editChatId.trim(),
        description: editDescription.trim() || undefined,
        isDefault: editIsDefault,
        isActive: editIsActive
      });
      setEditingId(null);
      await loadSettings();
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Failed to update target.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleTestTarget = async (target: TelegramTargetView): Promise<void> => {
    setTestingTargetId(target.id);
    try {
      const result = await sendTelegramTest({ chatId: target.chatId });
      setTargetTestResults((prev) => ({ ...prev, [target.id]: result }));
    } catch (err: unknown) {
      setTargetTestResults((prev) => ({
        ...prev,
        [target.id]: {
          ok: false,
          chatId: target.chatId,
          error: err instanceof Error ? err.message : 'Test failed.'
        }
      }));
    } finally {
      setTestingTargetId(null);
    }
  };

  const handleDeleteTarget = async (id: string): Promise<void> => {
    setDeletingId(id);
    try {
      await deleteTelegramTarget(id);
      setConfirmDeleteId(null);
      await loadSettings();
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Failed to delete target.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSendCustomTest = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!customTestChatId.trim()) return;
    setIsSendingCustomTest(true);
    setCustomTestResult(null);
    try {
      const result = await sendTelegramTest({
        chatId: customTestChatId.trim(),
        ...(customTestMessage.trim() ? { message: customTestMessage.trim() } : {})
      });
      setCustomTestResult(result);
    } catch (err: unknown) {
      setCustomTestResult({
        ok: false,
        chatId: customTestChatId.trim(),
        error: err instanceof Error ? err.message : 'Failed to send test message.'
      });
    } finally {
      setIsSendingCustomTest(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">
            Telegram Bot &amp; Multi-Group Targets
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Configure BotFather credentials, manage teacher/admin target chats, and test delivery.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadSettings({ force: true })}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loadError && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-brand-navy" />
          <span className="text-sm font-medium text-slate-700">
            Loading Telegram configuration...
          </span>
        </div>
      ) : (
        <>
          {/* Section A: BotFather Credentials */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-navy text-brand-gold">
                  <MessageSquare className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-brand-navy">
                    Section A — BotFather Credentials
                  </h2>
                  <p className="text-xs text-slate-500">
                    Stored encrypted in the database; falls back to TELEGRAM_BOT_TOKEN if unset.
                  </p>
                </div>
              </div>

              {config && (
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${configSourceBadgeClasses(
                    config.source
                  )}`}
                >
                  {configSourceLabel(config.source)}
                </span>
              )}
            </div>

            {config && (
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs">
                <span className="font-medium text-slate-600">Stored Bot Token:</span>
                <span className="font-mono font-semibold text-brand-navy">
                  {config.hasBotToken && config.botTokenMasked ? config.botTokenMasked : 'Not set'}
                </span>
              </div>
            )}

            <form onSubmit={(e) => void handleSaveBotConfig(e)} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Bot Token (from @BotFather)
                </label>
                <div className="relative mt-1">
                  <input
                    type={showBotToken ? 'text' : 'password'}
                    value={botTokenInput}
                    autoComplete="new-password"
                    onChange={(e) => setBotTokenInput(e.target.value)}
                    placeholder="Enter new BotFather token to save/rotate (leave blank to keep current)"
                    className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-3 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-navy focus:outline-none"
                  />
                  <button
                    type="button"
                    aria-label={showBotToken ? 'Hide bot token' : 'Show bot token'}
                    onClick={() => setShowBotToken((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    {showBotToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={isBotEnabled}
                  onChange={(e) => setIsBotEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-navy focus:ring-brand-navy"
                />
                <span className="font-medium text-slate-700">
                  Enable Telegram notifications &amp; report delivery
                </span>
              </label>

              {botStatus && (
                <div
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
                    botStatus.ok
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-red-200 bg-red-50 text-red-800'
                  }`}
                >
                  {botStatus.ok ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  )}
                  <span>{botStatus.message}</span>
                </div>
              )}

              <div>
                <button
                  type="submit"
                  disabled={isSavingBot}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 disabled:opacity-60"
                >
                  {isSavingBot ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 text-brand-gold" />
                  )}
                  Save Bot Settings
                </button>
              </div>
            </form>
          </section>

          {/* Section B: Multi-Group Target Chats */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-brand-navy">
                Section B — Multi-Group Target Chats ({targets.length})
              </h2>
              <p className="text-xs text-slate-500">
                Manage teacher/admin groups or channels that receive evaluated PDF reports and
                audits.
              </p>
            </div>

            {/* Target List */}
            {targets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                No Telegram target groups configured yet. Add one below.
              </div>
            ) : (
              <div className="space-y-3">
                {targets.map((target) => {
                  const isEditing = editingId === target.id;
                  const testResult = targetTestResults[target.id];
                  const isTesting = testingTargetId === target.id;
                  const isConfirmingDelete = confirmDeleteId === target.id;

                  return (
                    <div
                      key={target.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
                    >
                      {isEditing ? (
                        <div className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label className="block text-xs font-semibold text-slate-700">
                                Name
                              </label>
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-700">
                                Chat ID
                              </label>
                              <input
                                type="text"
                                value={editChatId}
                                onChange={(e) => setEditChatId(e.target.value)}
                                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-mono"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-700">
                              Description (optional)
                            </label>
                            <input
                              type="text"
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-5 text-xs">
                            <label className="inline-flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editIsDefault}
                                onChange={(e) => setEditIsDefault(e.target.checked)}
                              />
                              <span className="font-semibold text-slate-700">Default</span>
                            </label>
                            <label className="inline-flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editIsActive}
                                onChange={(e) => setEditIsActive(e.target.checked)}
                              />
                              <span className="font-semibold text-slate-700">Active</span>
                            </label>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleSaveEdit(target.id)}
                              disabled={isSavingEdit}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-semibold text-white"
                            >
                              {isSavingEdit ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Save className="h-3.5 w-3.5 text-brand-gold" />
                              )}
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                            >
                              <X className="h-3.5 w-3.5" />
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-bold text-brand-navy">
                                  {target.name}
                                </span>
                                <span className="rounded-md bg-white border border-slate-200 px-2 py-0.5 font-mono text-xs text-slate-700">
                                  {target.chatId}
                                </span>
                                {target.isDefault && (
                                  <span className="rounded-full bg-brand-cream border border-brand-gold/50 px-2 py-0.5 text-[11px] font-semibold text-brand-navy">
                                    Default
                                  </span>
                                )}
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                    target.isActive
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : 'bg-slate-100 text-slate-600 border-slate-200'
                                  }`}
                                >
                                  {target.isActive ? 'Active' : 'Inactive'}
                                </span>
                              </div>
                              {target.description && (
                                <p className="mt-1 text-xs text-slate-600">{target.description}</p>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => startEditingTarget(target)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                                Edit
                              </button>

                              <button
                                type="button"
                                onClick={() => void handleTestTarget(target)}
                                disabled={isTesting}
                                className="inline-flex items-center gap-1 rounded-lg border border-brand-gold bg-brand-cream px-2.5 py-1.5 text-xs font-semibold text-brand-navy hover:bg-brand-gold/20 disabled:opacity-60"
                              >
                                {isTesting ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Send className="h-3.5 w-3.5" />
                                )}
                                Test
                              </button>

                              {isConfirmingDelete ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteTarget(target.id)}
                                    disabled={deletingId === target.id}
                                    className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                                  >
                                    {deletingId === target.id ? 'Deleting...' : 'Confirm'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(target.id)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Delete
                                </button>
                              )}
                            </div>
                          </div>

                          {testResult && (
                            <div
                              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
                                testResult.ok
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                  : 'border-red-200 bg-red-50 text-red-800'
                              }`}
                            >
                              {testResult.ok ? (
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                              ) : (
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                              )}
                              <span>
                                {testResult.ok
                                  ? `Delivered (messageId: ${testResult.messageId ?? 'ok'})`
                                  : testResult.error || 'Delivery failed'}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add Target Group Form */}
            <form
              onSubmit={(e) => void handleCreateTarget(e)}
              className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3"
            >
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-brand-navy">
                <Plus className="h-4 w-4 text-brand-gold" />
                Add Target Group
              </h3>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Group / Channel Name
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Oxford ESL Teachers Group"
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Chat ID (starts with -100... for supergroups/channels)
                  </label>
                  <input
                    type="text"
                    value={newChatId}
                    onChange={(e) => setNewChatId(e.target.value)}
                    placeholder="-1001234567890"
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-mono focus:border-brand-navy focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Receives assessment reports and quota alerts"
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-6 text-xs">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newIsDefault}
                    onChange={(e) => setNewIsDefault(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-navy"
                  />
                  <span className="font-semibold text-slate-700">Default Target</span>
                </label>

                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newIsActive}
                    onChange={(e) => setNewIsActive(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-navy"
                  />
                  <span className="font-semibold text-slate-700">Active</span>
                </label>
              </div>

              {createTargetError && (
                <div className="text-xs font-medium text-red-700">{createTargetError}</div>
              )}

              <button
                type="submit"
                disabled={isCreatingTarget}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 disabled:opacity-60"
              >
                {isCreatingTarget ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 text-brand-gold" />
                )}
                Add Target Group
              </button>
            </form>
          </section>

          {/* Section C: Custom Test & BotFather Setup Guide */}
          <section className="grid gap-5 lg:grid-cols-2">
            {/* Quick Custom Test */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div>
                <h2 className="text-base font-bold text-brand-navy">
                  Section C — Quick Custom Test
                </h2>
                <p className="text-xs text-slate-500">
                  Send a test HTML message to any Chat ID before saving it as a target.
                </p>
              </div>

              <form onSubmit={(e) => void handleSendCustomTest(e)} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Chat ID</label>
                  <input
                    type="text"
                    value={customTestChatId}
                    onChange={(e) => setCustomTestChatId(e.target.value)}
                    placeholder="-1001234567890 or @username"
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-mono focus:border-brand-navy focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Custom HTML Message (optional)
                  </label>
                  <textarea
                    rows={3}
                    value={customTestMessage}
                    onChange={(e) => setCustomTestMessage(e.target.value)}
                    placeholder="<b>EdumenAI</b> test notification..."
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
                  />
                </div>

                {customTestResult && (
                  <div
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
                      customTestResult.ok
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-red-200 bg-red-50 text-red-800'
                    }`}
                  >
                    {customTestResult.ok ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 shrink-0" />
                    )}
                    <span>
                      {customTestResult.ok
                        ? `Test message sent to ${customTestResult.chatId} (messageId: ${customTestResult.messageId ?? 'ok'}).`
                        : customTestResult.error || 'Failed to send test message.'}
                    </span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSendingCustomTest || !customTestChatId.trim()}
                  className="inline-flex items-center gap-2 rounded-xl border border-brand-gold bg-brand-cream px-4 py-2 text-sm font-semibold text-brand-navy hover:bg-brand-gold/20 disabled:opacity-60"
                >
                  {isSendingCustomTest ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Send Test Message
                </button>
              </form>
            </div>

            {/* Collapsible BotFather Setup Guide */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm self-start">
              <button
                type="button"
                onClick={() => setShowSetupGuide((prev) => !prev)}
                className="flex w-full items-center justify-between px-6 py-4 text-left"
              >
                <span className="flex items-center gap-2 text-base font-bold text-brand-navy">
                  <BookOpen className="h-4 w-4 text-brand-gold" />
                  BotFather &amp; Group Chat ID Setup Guide
                </span>
                {showSetupGuide ? (
                  <ChevronUp className="h-4 w-4 text-slate-500" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-500" />
                )}
              </button>

              {showSetupGuide && (
                <ol className="space-y-3 border-t border-slate-100 px-6 py-4 text-sm text-slate-700 list-decimal list-inside">
                  <li>
                    Message <span className="font-mono font-semibold">@BotFather</span> on Telegram
                    and run <span className="font-mono font-semibold">/newbot</span> to get your
                    Bot Token.
                  </li>
                  <li>
                    Add the new bot to your Teachers/Admin Telegram group and promote it to{' '}
                    <span className="font-semibold">Admin</span> (so it can post PDFs and
                    messages).
                  </li>
                  <li>
                    Send a message in the group and retrieve its{' '}
                    <span className="font-mono font-semibold">chat.id</span> (starts with{' '}
                    <span className="font-mono">-100...</span> for supergroups, via{' '}
                    <span className="font-mono">@RawDataBot</span> or{' '}
                    <span className="font-mono">getUpdates</span>).
                  </li>
                  <li>
                    Save the token &amp; target Chat ID above, then click{' '}
                    <span className="font-semibold">Test</span> to confirm delivery.
                  </li>
                </ol>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
