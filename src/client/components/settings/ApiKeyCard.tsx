import { useEffect, useId, useState, type FormEvent } from "react";
import { CheckCircle2, CircleAlert, ExternalLink, Eye, EyeOff, KeyRound, PlugZap, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { CreditsResponse, SettingsResponse } from "@shared/types";
import * as api from "@/lib/api";
import { describeApiError } from "@/lib/api";
import { formatUsd } from "@/lib/format";
import { useSettings } from "@/store/settings";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { FieldLabel, Row, SettingsCard } from "./SettingsCard";

const KEYS_URL = "https://openrouter.ai/keys";

type TestState = { kind: "ok"; result: CreditsResponse; keyMasked?: string } | { kind: "error"; message: string } | null;

function KeyTestResult({ state }: { state: NonNullable<TestState> }) {
  if (state.kind === "error") {
    return (
      <div role="alert" className="mt-4 rounded-control border border-danger/25 bg-danger/5 p-3">
        <div className="mb-1 flex items-center gap-1.5 text-meta font-medium text-danger">
          <CircleAlert size={14} aria-hidden="true" />
          Connection failed
        </div>
        <p className="whitespace-pre-wrap break-words text-meta">{state.message}</p>
      </div>
    );
  }
  const r = state.result;
  const limit = r.key?.limit;
  return (
    <div role="status" className="mt-4 rounded-control border border-success/25 bg-success/5 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-meta font-medium text-success">
        <CheckCircle2 size={14} aria-hidden="true" />
        Connected to OpenRouter
      </div>
      <dl className="divide-y divide-border">
        <Row label="Key">
          <span className="inline-flex items-center gap-2">
            {r.key?.label ? <span>{r.key.label}</span> : null}
            {state.keyMasked ? <span className="text-mono text-fg-muted">{state.keyMasked}</span> : null}
            {r.key?.isFreeTier ? <Badge variant="neutral">Free tier</Badge> : null}
          </span>
        </Row>
        <Row label="Credits">
          <span className="tabular-nums">
            {formatUsd(r.remaining)} left · {formatUsd(r.used)} of {formatUsd(r.total)} used
          </span>
        </Row>
        <Row label="Spend limit">
          <span className="tabular-nums">{limit === null || limit === undefined ? "None" : formatUsd(limit)}</span>
        </Row>
        {r.key?.usage !== undefined ? (
          <Row label="Key usage">
            <span className="tabular-nums">{formatUsd(r.key.usage)}</span>
          </Row>
        ) : null}
      </dl>
    </div>
  );
}

function GetKeyLink() {
  return (
    <a
      href={KEYS_URL}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-body font-medium text-fg underline-offset-4 transition-colors hover:underline"
    >
      Get a key <ExternalLink size={13} aria-hidden="true" />
      <span className="sr-only">(opens openrouter.ai in a new tab)</span>
    </a>
  );
}

export function ApiKeyCard({ settings }: { settings: SettingsResponse | null }) {
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

  // A different active key invalidates the last test result.
  useEffect(() => {
    setTest(null);
  }, [settings?.keyMasked]);

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const next = await save({ apiKey: trimmed });
      setValue("");
      setReveal(false);
      toast.success("Key saved", { description: next.keyMasked ? `Now using ${next.keyMasked}` : undefined });
    } catch (err) {
      toast.error("Couldn't save the key", { description: describeApiError(err) });
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    if (testing) return;
    setTesting(true);
    setTest(null);
    try {
      const result = await api.testSettings(trimmed || undefined);
      setTest({ kind: "ok", result, keyMasked: trimmed ? undefined : settings?.keyMasked });
      toast.success("Connection OK", { description: `${formatUsd(result.remaining)} left` });
    } catch (err) {
      const message = describeApiError(err);
      setTest({ kind: "error", message });
      toast.error("Connection failed", { description: message });
    } finally {
      setTesting(false);
    }
  };

  const onRemove = async () => {
    setRemoving(true);
    try {
      await save({ apiKey: "" });
      setValue("");
      toast.success("Key removed");
    } catch (err) {
      toast.error("Couldn't remove the key", { description: describeApiError(err) });
    } finally {
      setRemoving(false);
      setConfirmRemove(false);
    }
  };

  const badge = !settings ? null : hasKey ? <Badge variant="new">Connected</Badge> : <Badge variant="neutral">Not set</Badge>;

  const canTest = Boolean(trimmed) || hasKey;

  return (
    <SettingsCard icon={<KeyRound />} title="OpenRouter key" badge={badge} description="Stays in this browser and is only ever sent to openrouter.ai.">
      {!settings ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-40" />
        </div>
      ) : (
        <form onSubmit={(e) => void onSave(e)} aria-describedby={hintId}>
          <FieldLabel htmlFor={inputId}>{hasKey ? "Replace key" : "Key"}</FieldLabel>
          <Input
            id={inputId}
            type={reveal ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="sk-or-v1-…"
            autoComplete="off"
            spellCheck={false}
            aria-describedby={hintId}
            className="font-mono [&_input]:font-mono [&_input]:text-[12px]"
            rightSlot={
              <IconButton
                label={reveal ? "Hide key" : "Show key"}
                size="sm"
                onClick={() => setReveal((r) => !r)}
                aria-pressed={reveal}
                disabled={!value}
              >
                {reveal ? <EyeOff /> : <Eye />}
              </IconButton>
            }
          />
          <p id={hintId} className="mt-2 text-meta">
            {hasKey ? (
              <>
                Using <span className="text-mono text-fg">{settings.keyMasked}</span>. Stored in this browser only. Use a dedicated key with a
                spend limit.
              </>
            ) : (
              <>No key yet. Generate stays off until one is saved here.</>
            )}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="submit" variant="primary" loading={saving} disabled={!trimmed}>
              Save
            </Button>
            <Button
              variant="secondary"
              leftIcon={<PlugZap />}
              loading={testing}
              disabled={!canTest}
              onClick={() => void onTest()}
              title={trimmed ? "Tests the key above without saving it" : "Tests the saved key"}
            >
              Test connection
            </Button>
            {hasKey ? (
              <Button
                variant="ghost"
                leftIcon={<Trash2 />}
                className="text-danger hover:bg-danger/10 hover:text-danger"
                onClick={() => setConfirmRemove(true)}
              >
                Remove key
              </Button>
            ) : null}
            <span className="ml-auto">
              <GetKeyLink />
            </span>
          </div>

          {test ? <KeyTestResult state={test} /> : null}

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
        </form>
      )}
    </SettingsCard>
  );
}
