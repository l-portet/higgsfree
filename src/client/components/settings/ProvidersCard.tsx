import { useEffect, useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { CheckCircle2, CircleAlert, Eye, EyeOff, KeyRound, PlugZap, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ProviderId, SettingsResponse } from "@shared/types";
import * as api from "@/lib/api";
import { describeApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useSettings } from "@/store/settings";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { FieldLabel, SettingsCard } from "./SettingsCard";

const KEYS_URL = "https://fal.ai/dashboard/keys";

const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: "openrouter", label: "OpenRouter" },
  { id: "fal", label: "fal" },
];

const providerName = (id: ProviderId) => PROVIDERS.find((p) => p.id === id)?.label ?? id;

type TestState = { kind: "ok" } | { kind: "error"; message: string } | null;

function TestResult({ state }: { state: NonNullable<TestState> }) {
  if (state.kind === "error") {
    return (
      <div role="alert" className="mt-4 flex items-start gap-2 rounded-control border border-danger/25 bg-danger/5 p-3 text-meta">
        <CircleAlert size={14} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
        <span className="whitespace-pre-wrap break-words">{state.message}</span>
      </div>
    );
  }
  return (
    <div role="status" className="mt-4 flex items-start gap-2 rounded-control border border-success/25 bg-success/5 p-3 text-meta">
      <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
      <span>fal accepted the key.</span>
    </div>
  );
}

/** Two-option segmented control with radio semantics (arrow keys move and select). */
function ProviderSwitch({
  value,
  onChange,
  disabled,
  labelledBy,
  describedBy,
}: {
  value: ProviderId;
  onChange: (id: ProviderId) => void;
  disabled?: boolean;
  labelledBy: string;
  describedBy: string;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + PROVIDERS.length) % PROVIDERS.length;
    const target = PROVIDERS[next];
    if (!target) return;
    e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
    onChange(target.id);
  };

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-disabled={disabled || undefined}
      className="flex w-fit gap-0.5 rounded-control border border-border bg-surface-2 p-1"
    >
      {PROVIDERS.map((p, i) => {
        const checked = p.id === value;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={disabled}
            onClick={() => !checked && onChange(p.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "inline-flex h-8 min-w-24 flex-1 select-none items-center justify-center whitespace-nowrap rounded-tag px-3 text-[13px] font-medium",
              "text-fg-muted transition-colors duration-150 hover:text-fg disabled:pointer-events-none disabled:opacity-50",
              checked && "bg-surface-3 text-fg",
            )}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

/** The fal key (paste, test, save, remove) and which provider runs the models both offer. */
export function ProvidersCard({ settings }: { settings: SettingsResponse | null }) {
  const save = useSettings((s) => s.save);
  const [value, setValue] = useState("");
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [test, setTest] = useState<TestState>(null);
  const [switching, setSwitching] = useState(false);
  const inputId = useId();
  const hintId = useId();
  const preferLabelId = useId();
  const preferHintId = useId();

  const hasKey = Boolean(settings?.hasFalKey);
  const trimmed = value.trim();
  const canTest = Boolean(trimmed) || hasKey;
  const canChoose = Boolean(settings?.hasKey && settings.hasFalKey);
  const preferred = settings?.preferredProvider ?? "openrouter";

  // A different active key invalidates the last test result.
  useEffect(() => {
    setTest(null);
  }, [settings?.falKeyMasked]);

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const next = await save({ falKey: trimmed });
      setValue("");
      setReveal(false);
      toast.success("fal key saved", { description: next.falKeyMasked ? `Now using ${next.falKeyMasked}` : undefined });
    } catch (err) {
      toast.error("Couldn't save the fal key", { description: describeApiError(err) });
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    if (testing || !canTest) return;
    setTesting(true);
    setTest(null);
    try {
      await api.testFalKey(trimmed || undefined);
      setTest({ kind: "ok" });
      toast.success("fal accepted the key");
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
      await save({ falKey: "" });
      setValue("");
      toast.success("fal key removed");
    } catch (err) {
      toast.error("Couldn't remove the fal key", { description: describeApiError(err) });
    } finally {
      setRemoving(false);
      setConfirmRemove(false);
    }
  };

  const onPrefer = async (id: ProviderId) => {
    if (switching || id === preferred) return;
    setSwitching(true);
    try {
      await save({ preferredProvider: id });
      toast.success(`Shared models now run on ${providerName(id)}`);
    } catch (err) {
      toast.error("Couldn't change the provider", { description: describeApiError(err) });
    } finally {
      setSwitching(false);
    }
  };

  const badge = !settings ? null : hasKey ? <Badge variant="new">Connected</Badge> : <Badge variant="neutral">Not set</Badge>;

  const description = (
    <>
      Some models run only on fal (Kling 3.0 Motion Control, Gemini Omni Flash, Vidu, PixVerse…). Add a fal key to use them. Get one at{" "}
      <a href={KEYS_URL} target="_blank" rel="noreferrer" className="font-medium text-fg underline-offset-4 hover:underline">
        fal.ai/dashboard/keys
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      .
    </>
  );

  return (
    <SettingsCard id="providers" icon={<KeyRound />} title="fal key" badge={badge} description={description}>
      {!settings ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-40" />
        </div>
      ) : (
        <>
          <form onSubmit={(e) => void onSave(e)} aria-describedby={hintId}>
            <FieldLabel htmlFor={inputId}>{hasKey ? "Replace key" : "Key"}</FieldLabel>
            <Input
              id={inputId}
              type={reveal ? "text" : "password"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="key_id:key_secret"
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
                  Using <span className="text-mono text-fg">{settings.falKeyMasked}</span>. Stored in this browser only. Sent only to fal.
                </>
              ) : (
                <>No key yet. Models that run only on fal stay off until one is saved here.</>
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
            </div>

            {test ? <TestResult state={test} /> : null}

            <ConfirmDialog
              open={confirmRemove}
              onOpenChange={(o) => !removing && setConfirmRemove(o)}
              title="Remove the fal key?"
              description="Models that run only on fal stop until you add a key again. Your library is kept."
              confirmLabel="Remove key"
              danger
              loading={removing}
              onConfirm={onRemove}
            />
          </form>

          <div className="mt-5 border-t border-border pt-4">
            <div id={preferLabelId} className="mb-1.5 text-label">
              Run models both providers offer on
            </div>
            <ProviderSwitch
              value={preferred}
              onChange={(id) => void onPrefer(id)}
              disabled={!canChoose}
              labelledBy={preferLabelId}
              describedBy={preferHintId}
            />
            <p id={preferHintId} className="mt-2 text-meta">
              {canChoose
                ? "Models only one provider offers always run there."
                : "Add both keys to choose. Until then, each model uses the provider you have a key for."}
            </p>
          </div>
        </>
      )}
    </SettingsCard>
  );
}
