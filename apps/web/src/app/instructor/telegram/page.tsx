'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { TelegramTargetView } from '@edumenai/shared';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  HelpCircle,
  Loader2,
  Pencil,
  Plus,
  Send,
  Star,
  Trash2,
  X
} from 'lucide-react';
import {
  createInstructorTelegramTarget,
  deleteInstructorTelegramTarget,
  fetchInstructorTelegram,
  INSTRUCTOR_CACHE_KEYS,
  sendInstructorTelegramTest,
  updateInstructorTelegramTarget,
  type InstructorTelegramData
} from '../../../lib/instructor-api';
import { getCached, isCacheFresh } from '../../../lib/client-cache';
import { validateTelegramGroupId } from '../../../lib/validation';
import { InstructorShell } from '../../../components/instructor/InstructorShell';
import { PageEntrance, SPRING_GENTLE } from '../../../components/ui/MotionPrimitives';

function InstructorTelegramContent(): React.ReactElement {
  const initialData = getCached<InstructorTelegramData>(INSTRUCTOR_CACHE_KEYS.telegram);
  const [data, setData] = useState<InstructorTelegramData | null>(initialData);
  const [isLoading, setIsLoading] = useState<boolean>(initialData === null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ ok: boolean; message: string } | null>(null);
  const [showGuide, setShowGuide] = useState<boolean>(true);

  // Add / Edit Target form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState<string>('');
  const [chatIdInput, setChatIdInput] = useState<string>('');
  const [descriptionInput, setDescriptionInput] = useState<string>('');
  const [isDefaultInput, setIsDefaultInput] = useState<boolean>(false);
  const [isActiveInput, setIsActiveInput] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Row actions
  const [busyTargetId, setBusyTargetId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Send Test Message form
  const [testChatId, setTestChatId] = useState<string>('');
  const [testMessage, setTestMessage] = useState<string>(
    'Hello from EdumenAI Instructor Studio! This class group is connected for automatic PDF reports.'
  );
  const [isSendingTest, setIsSendingTest] = useState<boolean>(false);

  const loadTelegram = useCallback(async (force = false) => {
    if (
      !force &&
      isCacheFresh(INSTRUCTOR_CACHE_KEYS.telegram, 30_000) &&
      getCached<InstructorTelegramData>(INSTRUCTOR_CACHE_KEYS.telegram)
    ) {
      setIsLoading(false);
      return;
    }
    if (!getCached<InstructorTelegramData>(INSTRUCTOR_CACHE_KEYS.telegram)) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const res = await fetchInstructorTelegram({ force });
      setData(res);
      if (res.targets.length > 0 && !testChatId) {
        const preferred = res.targets.find((t) => t.isDefault) ?? res.targets[0];
        if (preferred) setTestChatId(preferred.chatId);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load Telegram groups.');
    } finally {
      setIsLoading(false);
    }
  }, [testChatId]);

  useEffect(() => {
    void loadTelegram(false);
  }, [loadTelegram]);

  const resetForm = (): void => {
    setEditingId(null);
    setNameInput('');
    setChatIdInput('');
    setDescriptionInput('');
    setIsDefaultInput(false);
    setIsActiveInput(true);
  };

  const startEdit = (target: TelegramTargetView): void => {
    setEditingId(target.id);
    setNameInput(target.name);
    setChatIdInput(target.chatId);
    setDescriptionInput(target.description ?? '');
    setIsDefaultInput(target.isDefault);
    setIsActiveInput(target.isActive);
    setBanner(null);
  };

  const chatIdInputErr = chatIdInput ? validateTelegramGroupId(chatIdInput, true) : null;
  const testChatIdErr = testChatId ? validateTelegramGroupId(testChatId, true) : null;

  const handleSaveTarget = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const name = nameInput.trim();
    const chatId = chatIdInput.trim();
    if (!name || !chatId) {
      setBanner({ ok: false, message: 'Group name and Chat ID are required.' });
      return;
    }
    const chatErr = validateTelegramGroupId(chatId, true);
    if (chatErr) {
      setBanner({ ok: false, message: chatErr });
      return;
    }

    setIsSaving(true);
    setBanner(null);
    try {
      if (editingId) {
        await updateInstructorTelegramTarget(editingId, {
          name,
          chatId,
          description: descriptionInput.trim() || undefined,
          isDefault: isDefaultInput,
          isActive: isActiveInput
        });
        setBanner({ ok: true, message: `Updated Telegram group "${name}".` });
      } else {
        await createInstructorTelegramTarget({
          name,
          chatId,
          description: descriptionInput.trim() || undefined,
          isDefault: isDefaultInput,
          isActive: isActiveInput
        });
        setBanner({ ok: true, message: `Added Telegram group "${name}".` });
      }
      resetForm();
      await loadTelegram(true);
    } catch (err: unknown) {
      setBanner({
        ok: false,
        message: err instanceof Error ? err.message : 'Failed to save Telegram group.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleDefault = async (target: TelegramTargetView): Promise<void> => {
    setBusyTargetId(target.id);
    setBanner(null);
    try {
      await updateInstructorTelegramTarget(target.id, { isDefault: !target.isDefault });
      setBanner({
        ok: true,
        message: !target.isDefault
          ? `"${target.name}" is now a default class delivery target.`
          : `Removed default flag from "${target.name}".`
      });
      await loadTelegram(true);
    } catch (err: unknown) {
      setBanner({
        ok: false,
        message: err instanceof Error ? err.message : 'Failed to update default setting.'
      });
    } finally {
      setBusyTargetId(null);
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    setBusyTargetId(id);
    setBanner(null);
    try {
      await deleteInstructorTelegramTarget(id);
      setConfirmDeleteId(null);
      if (editingId === id) resetForm();
      setBanner({ ok: true, message: 'Telegram group removed.' });
      await loadTelegram(true);
    } catch (err: unknown) {
      setBanner({
        ok: false,
        message: err instanceof Error ? err.message : 'Failed to delete Telegram group.'
      });
    } finally {
      setBusyTargetId(null);
    }
  };

  const handleSendTest = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const chatId = testChatId.trim();
    if (!chatId) {
      setBanner({ ok: false, message: 'Enter or select a Chat ID to send a test message.' });
      return;
    }
    const chatErr = validateTelegramGroupId(chatId, true);
    if (chatErr) {
      setBanner({ ok: false, message: chatErr });
      return;
    }

    setIsSendingTest(true);
    setBanner(null);
    try {
      const result = await sendInstructorTelegramTest(chatId, testMessage);
      if (result.ok) {
        setBanner({ ok: true, message: `Test message delivered to Chat ID ${chatId}!` });
      } else {
        setBanner({
          ok: false,
          message: result.error || 'Telegram rejected the test message. Check the Chat ID and bot permissions.'
        });
      }
    } catch (err: unknown) {
      setBanner({
        ok: false,
        message: err instanceof Error ? err.message : 'Failed to send test message.'
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const botActive = Boolean(
    (data?.config.isEnabled ?? data?.config.enabled) &&
      (data?.config.hasBotToken ?? data?.config.botConfigured ?? data?.config.configured ?? true)
  );
  const targets = data?.targets ?? [];

  return (
    <PageEntrance className="space-y-6">
      {/* Header + Platform Bot Status Badge */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="glass-pill">Automated Report Delivery</span>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-3xl">
            Class Telegram Groups
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Receive student evaluation audits and marked PDFs directly in your own class or school
            Telegram groups.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ${
              botActive
                ? 'border-emerald-200 bg-emerald-50/85 text-emerald-800'
                : 'border-amber-200 bg-amber-50/85 text-amber-800'
            }`}
          >
            <Bot className="h-3.5 w-3.5" />
            Platform Bot: {botActive ? 'Active' : 'Disabled'}
            {data?.config.botUsername ? ` (@${data.config.botUsername.replace(/^@/, '')})` : ''}
          </span>
        </div>
      </div>

      {/* Collapsible Setup Guide */}
      <section className="glass-panel overflow-hidden">
        <button
          type="button"
          onClick={() => setShowGuide((prev) => !prev)}
          aria-expanded={showGuide}
          className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-bold text-zinc-950 transition-colors hover:bg-white/60"
        >
          <span className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-zinc-500" />
            How to connect your Telegram class group &amp; find its Chat ID
          </span>
          <ChevronDown
            className={`h-4 w-4 text-zinc-500 transition-transform duration-200 ${
              showGuide ? 'rotate-180' : ''
            }`}
          />
        </button>

        <AnimatePresence initial={false}>
          {showGuide && (
            <motion.div
              key="tg-guide"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={SPRING_GENTLE}
              className="overflow-hidden"
            >
              <ol className="space-y-2 border-t border-zinc-900/[0.06] px-5 py-4 text-xs leading-relaxed text-zinc-600">
                <li>
                  <strong className="text-zinc-900">1. Add the EdumenAI Bot:</strong> Open your
                  class or school Telegram group, tap <em>Add Members</em>, and add the EdumenAI
                  platform bot
                  {data?.config.botUsername
                    ? ` (@${data.config.botUsername.replace(/^@/, '')})`
                    : ''}
                  . Promote it or allow it to post messages &amp; documents.
                </li>
                <li>
                  <strong className="text-zinc-900">2. Copy the Group Chat ID:</strong> Add{' '}
                  <code className="rounded bg-zinc-900/[0.06] px-1.5 py-0.5 font-mono text-zinc-800">
                    @RawDataBot
                  </code>{' '}
                  or{' '}
                  <code className="rounded bg-zinc-900/[0.06] px-1.5 py-0.5 font-mono text-zinc-800">
                    @userinfobot
                  </code>{' '}
                  temporarily (or forward a group message to it) to read the numeric group ID
                  (usually starts with{' '}
                  <code className="rounded bg-zinc-900/[0.06] px-1.5 py-0.5 font-mono text-zinc-800">
                    -100...
                  </code>
                  ).
                </li>
                <li>
                  <strong className="text-zinc-900">3. Save &amp; Test:</strong> Add the group
                  below, mark your main class group as <strong>Default</strong>, and send a quick
                  test message to confirm delivery. Your groups are completely private to your
                  account.
                </li>
              </ol>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {banner && (
        <div
          role="status"
          className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm backdrop-blur-md ${
            banner.ok
              ? 'border-emerald-200/80 bg-emerald-50/85 text-emerald-800'
              : 'border-rose-200/80 bg-rose-50/85 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {banner.ok ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <span>{banner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setBanner(null)}
            aria-label="Dismiss notice"
            className="rounded-lg p-1 hover:bg-black/5"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-xl border border-rose-200/80 bg-rose-50/85 px-4 py-3 text-sm text-rose-800 backdrop-blur-md"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="glass-panel-strong flex items-center gap-3 p-6">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-700" />
          <span className="text-sm font-medium text-zinc-700">Loading Telegram groups...</span>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left 2 cols: Targets list + Add/Edit Form */}
          <div className="space-y-6 lg:col-span-2">
            {/* Existing Groups */}
            <section className="glass-panel-strong overflow-hidden">
              <div className="flex items-center justify-between border-b border-zinc-900/[0.06] px-5 py-4">
                <div>
                  <h2 className="text-base font-bold text-zinc-950">
                    My Connected Groups ({targets.length})
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Reports for students assigned to you automatically dispatch to your default
                    groups.
                  </p>
                </div>
              </div>

              {targets.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <Bot className="mx-auto h-7 w-7 text-zinc-400" />
                  <p className="mt-3 text-sm font-semibold text-zinc-800">
                    No Telegram groups added yet
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Add your first class group using the form below to start receiving automatic
                    PDF reports.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-900/[0.05]">
                  {targets.map((target) => {
                    const isBusy = busyTargetId === target.id;
                    const isConfirming = confirmDeleteId === target.id;

                    return (
                      <div
                        key={target.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-white/60"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-zinc-950">{target.name}</span>
                            {target.isDefault && (
                              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50/85 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                <Star className="h-3 w-3" />
                                Default
                              </span>
                            )}
                            {!target.isActive && (
                              <span className="shrink-0 whitespace-nowrap rounded-full border border-amber-200 bg-amber-50/85 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                Paused
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 font-mono text-xs text-zinc-500">
                            Chat ID: {target.chatId}
                          </div>
                          {target.description && (
                            <p className="mt-1 text-xs text-zinc-600">{target.description}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {isConfirming ? (
                            <div className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/85 px-2.5 py-1.5 text-xs">
                              <span className="font-semibold text-rose-900">Remove?</span>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleDelete(target.id)}
                                className="rounded-md bg-rose-600 px-2 py-0.5 font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => setConfirmDeleteId(null)}
                                className="rounded-md bg-white px-2 py-0.5 font-semibold text-zinc-700"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleToggleDefault(target)}
                                className="glass-btn-secondary !rounded-lg !px-2.5 !py-1.5 text-xs"
                              >
                                <Star className="h-3.5 w-3.5" />
                                {target.isDefault ? 'Unset Default' : 'Set Default'}
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => startEdit(target)}
                                aria-label={`Edit ${target.name}`}
                                className="glass-btn-secondary !rounded-lg !px-2.5 !py-1.5"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => setConfirmDeleteId(target.id)}
                                aria-label={`Delete ${target.name}`}
                                className="glass-btn-secondary !rounded-lg !px-2.5 !py-1.5 text-rose-700 hover:!border-rose-200 hover:!bg-rose-50/90"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Add / Edit Group Form */}
            <form
              onSubmit={(e) => void handleSaveTarget(e)}
              className="glass-panel space-y-4 p-5 sm:p-6"
            >
              <div className="flex items-center justify-between border-b border-zinc-900/[0.06] pb-3">
                <h2 className="text-base font-bold text-zinc-950">
                  {editingId ? 'Edit Telegram Group' : 'Add New Telegram Group'}
                </h2>
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-xs font-semibold text-zinc-500 hover:text-zinc-900"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="tg-name"
                    className="mb-1 block text-xs font-semibold text-zinc-600"
                  >
                    Group Name *
                  </label>
                  <input
                    id="tg-name"
                    type="text"
                    required
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="e.g., Year 10 ESL — Section A"
                    className="glass-input"
                  />
                </div>

                <div>
                  <label
                    htmlFor="tg-chat-id"
                    className="mb-1 block text-xs font-semibold text-zinc-600"
                  >
                    Telegram Chat ID *
                  </label>
                  <input
                    id="tg-chat-id"
                    type="text"
                    required
                    value={chatIdInput}
                    onChange={(e) => setChatIdInput(e.target.value)}
                    placeholder="-1001234567890"
                    aria-invalid={Boolean(chatIdInputErr)}
                    className={`glass-input font-mono text-xs ${chatIdInputErr ? '!border-rose-300' : ''}`}
                  />
                  {chatIdInputErr && (
                    <p className="mt-1 text-[11px] font-medium text-rose-700">{chatIdInputErr}</p>
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="tg-desc"
                  className="mb-1 block text-xs font-semibold text-zinc-600"
                >
                  Notes (optional)
                </label>
                <input
                  id="tg-desc"
                  type="text"
                  value={descriptionInput}
                  onChange={(e) => setDescriptionInput(e.target.value)}
                  placeholder="Optional label for teachers or department"
                  className="glass-input"
                />
              </div>

              <div className="flex flex-wrap items-center gap-5 pt-1">
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-zinc-700">
                  <input
                    type="checkbox"
                    checked={isDefaultInput}
                    onChange={(e) => setIsDefaultInput(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                  />
                  Default delivery group for my students
                </label>

                <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-zinc-700">
                  <input
                    type="checkbox"
                    checked={isActiveInput}
                    onChange={(e) => setIsActiveInput(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                  />
                  Active
                </label>
              </div>

              <div className="flex justify-end">
                <button type="submit" disabled={isSaving} className="glass-btn-primary">
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {editingId ? 'Save Changes' : 'Add Group'}
                </button>
              </div>
            </form>
          </div>

          {/* Right Col: Send Test Message */}
          <div>
            <form
              onSubmit={(e) => void handleSendTest(e)}
              className="glass-panel-strong space-y-4 p-5 sm:p-6"
            >
              <div className="border-b border-zinc-900/[0.06] pb-3">
                <h2 className="text-base font-bold text-zinc-950">Send Test Message</h2>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Verify the EdumenAI bot can post to your group before students submit.
                </p>
              </div>

              {targets.length > 0 && (
                <div>
                  <label
                    htmlFor="tg-test-preset"
                    className="mb-1 block text-xs font-semibold text-zinc-600"
                  >
                    Quick Select Group
                  </label>
                  <select
                    id="tg-test-preset"
                    value={targets.some((t) => t.chatId === testChatId) ? testChatId : ''}
                    onChange={(e) => {
                      if (e.target.value) setTestChatId(e.target.value);
                    }}
                    className="glass-input"
                  >
                    <option value="">Choose a saved group...</option>
                    {targets.map((t) => (
                      <option key={t.id} value={t.chatId}>
                        {t.name} ({t.chatId})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label
                  htmlFor="tg-test-chat-id"
                  className="mb-1 block text-xs font-semibold text-zinc-600"
                >
                  Target Chat ID *
                </label>
                <input
                  id="tg-test-chat-id"
                  type="text"
                  required
                  value={testChatId}
                  onChange={(e) => setTestChatId(e.target.value)}
                  placeholder="-1001234567890"
                  aria-invalid={Boolean(testChatIdErr)}
                  className={`glass-input font-mono text-xs ${testChatIdErr ? '!border-rose-300' : ''}`}
                />
                {testChatIdErr && (
                  <p className="mt-1 text-[11px] font-medium text-rose-700">{testChatIdErr}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="tg-test-msg"
                  className="mb-1 block text-xs font-semibold text-zinc-600"
                >
                  Test Message
                </label>
                <textarea
                  id="tg-test-msg"
                  rows={3}
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  className="glass-input"
                />
              </div>

              <button
                type="submit"
                disabled={isSendingTest || !botActive}
                className="glass-btn-primary w-full"
              >
                {isSendingTest ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send Test Message
              </button>

              {!botActive && (
                <p className="text-[11px] text-amber-800">
                  The platform Telegram bot is currently disabled by an administrator.
                </p>
              )}
            </form>
          </div>
        </div>
      )}
    </PageEntrance>
  );
}

export default function InstructorTelegramPage(): React.ReactElement {
  return (
    <InstructorShell>
      <InstructorTelegramContent />
    </InstructorShell>
  );
}
