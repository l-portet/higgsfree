import Link from "next/link";
import { useEffect, useId, useState, type FormEvent } from "react";
import { CheckCircle2, CircleAlert, ExternalLink, Eye, EyeOff, PlugZap, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { CreditsResponse } from "@shared/types";
import * as api from "@/lib/api";
import { describeApiError } from "@/lib/api";
import { formatUsd } from "@/lib/format";
import { useSettings } from "@/store/settings";
import { useUi } from "@/store/ui";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/Dialog";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";

const KEYS_URL = "https://openrouter.ai/keys";

type TestState = { kind: "ok"; result: CreditsResponse } | { kind: "error"; message: string } | null;

function TestResult({ state }: { state: NonNullable<TestState> }) {
  if (state.kind === "error") {
    return (
      <div role="alert" className="mt-4 flex items-start gap-2 rounded-control border border-danger/25 bg-danger/5 p-3 text-meta">
        <CircleAlert size={14} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
        <span className="whitespace-pre-wrap break-words">{state.message}</span>
      </div>
    );
  }
  const r = state.result;
  return (
    <div role="status" className="mt-4 flex items-start gap-2 rounded-control border border-success/25 bg-success/5 p-3 text-meta">
      <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
      <span className="tabular-nums">
        Connected{r.key?.label ? ` as ${r.key.label}` : ""}: {formatUsd(r.remaining)} left, {formatUsd(r.used)} of {formatUsd(r.total)} used.
      </span>
    </div>
  );
}

/** The "API key" dialog behind the Add key pill: paste, test, save or remove the OpenRouter key. */
export function KeyDialog() {
  const open = useUi((s) => s.keyDialog);
  const close = useUi((s) => s.closeKeyDialog);
  const settings = useSettings((s) => s.settings);
  const credits = useSettings((s) => s.credits);
  const save = useSettings((s) => s.save);
  const [value, setValue] = useState("");
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [test, setTest] = useState<TestState>(null);
  const inputId = useId();
  const hintId = useId();

  const hasKey = Boolean(settings?.hasKey);
  const trimmed = value.trim();
  const canTest = Boolean(trimmed) || hasKey;

  // Start clean every time the dialog opens.
  useEffect(() => {
    if (open) return;
    setValue("");
    setReveal(false);
    setTest(null);
  }, [open]);

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const next = await save({ apiKey: trimmed });
      toast.success("Key saved", { description: next.keyMasked ? `Now using ${next.keyMasked}` : undefined });
      close();
    } catch (err) {
      toast.error("Couldn't save the key", { description: describeApiError(err) });
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    if (testing || !canTest) return;
    setTesting(true);
    setTest(null);
    try {
      const result = await api.testSettings(trimmed || undefined);
      setTest({ kind: "ok", result });
    } catch (err) {
      setTest({ kind: "error", message: describeApiError(err) });
    } finally {
      setTesting(false);
    }
  };

  const onRemove = async () => {
    setRemoving(true);
    try {
      await save({ apiKey: "" });
      toast.success("Key removed");
      setConfirmRemove(false);
    } catch (err) {
      toast.error("Couldn't remove the key", { description: describeApiError(err) });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent size="md" className="max-w-[440px]">
        <DialogTitle>API key</DialogTitle>
        <DialogDescription>Paste your OpenRouter key. It stays in this browser and is only ever sent to openrouter.ai.</DialogDescription>

        {!settings ? (
          <div className="mt-5 flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-[34px] w-full rounded-field" />
            <Skeleton className="h-9 w-28" />
          </div>
        ) : (
          <form onSubmit={(e) => void onSave(e)} className="mt-5" aria-describedby={hintId}>
            <label htmlFor={inputId} className="mb-2 block text-[13px] font-medium text-fg-muted">
              {hasKey ? "Replace key" : "API key"}
            </label>
            <Input
              id={inputId}
              type={reveal ? "text" : "password"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="sk-or-v1-…"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              className="[&_input]:h-[34px] [&_input]:font-mono [&_input]:text-[13px]"
              rightSlot={
                <IconButton label={reveal ? "Hide key" : "Show key"} size="sm" onClick={() => setReveal((r) => !r)} aria-pressed={reveal} disabled={!value}>
                  {reveal ? <EyeOff /> : <Eye />}
                </IconButton>
              }
            />
            <p id={hintId} className="mt-2 text-meta">
              {hasKey ? (
                <>
                  Using <span className="text-mono text-fg">{settings.keyMasked}</span>
                  {credits ? <span className="tabular-nums">, {formatUsd(credits.remaining)} left</span> : null}. Stored in this browser only. Use a
                  dedicated key with a spend limit.
                </>
              ) : (
                <>No key yet. Generate stays off until one is saved here.</>
              )}
            </p>
            {test ? <TestResult state={test} /> : null}

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Button variant="ghost" leftIcon={<PlugZap />} loading={testing} disabled={!canTest} onClick={() => void onTest()} title={trimmed ? "Tests the key above without saving it" : "Tests the saved key"} className="h-[34px]">
                Test
              </Button>
              {hasKey ? (
                <Button variant="ghost" leftIcon={<Trash2 />} className="h-[34px] text-danger hover:bg-danger/10 hover:text-danger" onClick={() => setConfirmRemove(true)}>
                  Remove
                </Button>
              ) : (
                <GetKeyLink />
              )}
              <Button type="submit" variant="primary" loading={saving} disabled={!trimmed} className="ml-auto h-[34px] font-semibold">
                Save key
              </Button>
            </div>
          </form>
        )}

        <p className="mt-5 border-t border-border pt-4 text-caption">
          <Link href="/settings" onClick={close} className="font-medium text-fg-muted underline-offset-4 transition-colors hover:text-fg hover:underline">
            All settings
          </Link>
          <span> · default models, library, about</span>
        </p>

        <ConfirmDialog
          open={confirmRemove}
          onOpenChange={(o) => !removing && setConfirmRemove(o)}
          title="Remove the saved key?"
          description="Generating stops until you add a key again. Your library is kept."
          confirmLabel="Remove key"
          danger
          loading={removing}
          onConfirm={onRemove}
        />
      </DialogContent>
    </Dialog>
  );
}

function GetKeyLink() {
  return (
    <a
      href={KEYS_URL}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-[13px] font-medium text-fg-muted underline-offset-4 transition-colors hover:text-fg hover:underline"
    >
      Get a key <ExternalLink size={13} aria-hidden="true" />
      <span className="sr-only">(opens openrouter.ai in a new tab)</span>
    </a>
  );
}
