import { useEffect, useId, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, Eye, EyeOff, KeyRound, PlugZap, Shuffle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ProviderId, SettingsResponse } from "@shared/types";
import * as api from "@/lib/api";
import { describeApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/format";
import { KIE_CREDIT_USD } from "@/lib/kie";
import { PROVIDER_IDS, PROVIDER_KEYS, PROVIDER_NAME } from "@/lib/providers";
import { useSettings } from "@/store/settings";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { FieldLabel, SettingsCard } from "./SettingsCard";

type KeyedProvider = Exclude<ProviderId, "openrouter">;

type TestState = { kind: "ok"; credits?: number; balanceUsd?: number } | { kind: "error"; message: string } | null;

function TestResult({ provider, state }: { provider: KeyedProvider; state: NonNullable<TestState> }) {
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
      <span>
        {PROVIDER_NAME[provider]} accepted the key.
        {state.credits !== undefined ? ` Balance: ${state.credits.toLocaleString("en-US")} credits (${formatUsd(state.credits * KIE_CREDIT_USD)}).` : ""}
        {state.balanceUsd !== undefined ? ` Balance: ${state.balanceUsd < 0 ? "unlimited" : formatUsd(state.balanceUsd)}.` : ""}
      </span>
    </div>
  );
}

/** Segmented control with radio semantics (arrow keys move and select). */
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
    const next = (index + step + PROVIDER_IDS.length) % PROVIDER_IDS.length;
    const target = PROVIDER_IDS[next];
    if (!target) return;
    e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
    onChange(target);
  };

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-disabled={disabled || undefined}
      className="flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-control border border-border bg-surface-2 p-1"
    >
      {PROVIDER_IDS.map((id, i) => {
        const checked = id === value;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={disabled}
            onClick={() => !checked && onChange(id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "inline-flex h-8 min-w-24 flex-1 select-none items-center justify-center whitespace-nowrap rounded-tag px-3 text-[13px] font-medium",
              "text-fg-muted transition-colors duration-150 hover:text-fg disabled:pointer-events-none disabled:opacity-50",
              checked && "bg-surface-3 text-fg",
            )}
          >
            {PROVIDER_NAME[id]}
          </button>
        );
      })}
    </div>
  );
}

/** One provider's key: paste, test, save, remove. */
function ProviderKeyCard({ provider, settings, description, offHint }: { provider: KeyedProvider; settings: SettingsResponse | null; description: ReactNode; offHint: string }) {
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

  const name = PROVIDER_NAME[provider];
  const masked = settings?.keys[provider];
  const hasKey = Boolean(masked);
  const trimmed = value.trim();
  const canTest = Boolean(trimmed) || hasKey;

  // A different active key invalidates the last test result.
  useEffect(() => {
    setTest(null);
  }, [masked]);

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const next = await save({ keys: { [provider]: trimmed } });
      setValue("");
      setReveal(false);
      toast.success(`${name} key saved`, { description: next.keys[provider] ? `Now using ${next.keys[provider]}` : undefined });
    } catch (err) {
      toast.error(`Couldn't save the ${name} key`, { description: describeApiError(err) });
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    if (testing || !canTest) return;
    setTesting(true);
    setTest(null);
    try {
      const res = await api.testProviderKey(provider, trimmed || undefined);
      setTest({ kind: "ok", ...(res.credits !== undefined ? { credits: res.credits } : {}), ...(res.balanceUsd !== undefined ? { balanceUsd: res.balanceUsd } : {}) });
      toast.success(`${name} accepted the key`);
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
      await save({ keys: { [provider]: "" } });
      setValue("");
      toast.success(`${name} key removed`);
    } catch (err) {
      toast.error(`Couldn't remove the ${name} key`, { description: describeApiError(err) });
    } finally {
      setRemoving(false);
      setConfirmRemove(false);
    }
  };

  const badge = !settings ? null : hasKey ? <Badge variant="new">Connected</Badge> : <Badge variant="neutral">Not set</Badge>;

  return (
    <SettingsCard id={`provider-${provider}`} icon={<KeyRound />} title={`${name} key`} badge={badge} description={description}>
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
            type="text"
            masked={!reveal}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={PROVIDER_KEYS[provider].placeholder}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={hintId}
            className="font-mono [&_input]:font-mono [&_input]:text-[12px]"
            rightSlot={
              <IconButton label={reveal ? "Hide key" : "Show key"} size="sm" onClick={() => setReveal((r) => !r)} aria-pressed={reveal} disabled={!value}>
                {reveal ? <EyeOff /> : <Eye />}
              </IconButton>
            }
          />
          <p id={hintId} className="mt-2 text-meta">
            {hasKey ? (
              <>
                Using <span className="text-mono text-fg">{masked}</span>. Stored in this browser only. Sent only to {name}.
              </>
            ) : (
              offHint
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
              <Button variant="ghost" leftIcon={<Trash2 />} className="text-danger hover:bg-danger/10 hover:text-danger" onClick={() => setConfirmRemove(true)}>
                Remove key
              </Button>
            ) : null}
          </div>

          {test ? <TestResult provider={provider} state={test} /> : null}

          <ConfirmDialog
            open={confirmRemove}
            onOpenChange={(o) => !removing && setConfirmRemove(o)}
            title={`Remove the ${name} key?`}
            description={`Models that run only on ${name} stop until you add a key again. Your library is kept.`}
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

function KeysLink({ provider }: { provider: KeyedProvider }) {
  const { url } = PROVIDER_KEYS[provider];
  return (
    <a href={url} target="_blank" rel="noreferrer" className="font-medium text-fg underline-offset-4 hover:underline">
      {url.replace(/^https:\/\//, "")}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** Which provider runs what several offer: images, and videos at the same price. */
function PreferenceCard({ settings }: { settings: SettingsResponse | null }) {
  const save = useSettings((s) => s.save);
  const [switching, setSwitching] = useState(false);
  const labelId = useId();
  const hintId = useId();
  const preferred = settings?.preferredProvider ?? "openrouter";
  const keyed = PROVIDER_IDS.filter((p) => settings?.keys[p]).length;

  const onPrefer = async (id: ProviderId) => {
    if (switching || id === preferred) return;
    setSwitching(true);
    try {
      await save({ preferredProvider: id });
      toast.success(`Shared models now run on ${PROVIDER_NAME[id]}`, { description: "Videos still go to whichever provider costs less." });
    } catch (err) {
      toast.error("Couldn't change the provider", { description: describeApiError(err) });
    } finally {
      setSwitching(false);
    }
  };

  if (!settings) return null;
  return (
    <SettingsCard id="providers" icon={<Shuffle />} title="Models several providers offer">
      <div id={labelId} className="mb-1.5 text-label">
        Prefer
      </div>
      <ProviderSwitch value={preferred} onChange={(id) => void onPrefer(id)} disabled={keyed < 2} labelledBy={labelId} describedBy={hintId} />
      <p id={hintId} className="mt-2 text-meta">
        {keyed >= 2
          ? "Videos go to whichever costs less; this decides images, and videos at the same price, among the providers you have a key for. Models only one provider offers always run there."
          : "Add a second key to choose. Until then, each model uses the provider you have a key for."}
      </p>
    </SettingsCard>
  );
}

/** The fal, kie.ai and APIMart keys, and which provider runs what several offer. */
export function ProvidersCard({ settings }: { settings: SettingsResponse | null }) {
  return (
    <>
      <ProviderKeyCard
        provider="fal"
        settings={settings}
        description={
          <>
            Some models run only on fal (Kling 3.0 Motion Control, Gemini Omni Flash, Vidu, PixVerse…). Add a fal key to use them. Get one at <KeysLink provider="fal" />.
          </>
        }
        offHint="No key yet. Models that run only on fal stay off until one is saved here."
      />
      <ProviderKeyCard
        provider="kie"
        settings={settings}
        description={
          <>
            kie.ai runs many of these models for less (Veo 3.1, Kling 3.0, MiniMax H3, Wan, Grok Imagine, Nano Banana Pro…): with a key, a video goes there
            whenever it is the cheapest. Get one at <KeysLink provider="kie" />.
          </>
        }
        offHint="No key yet. Runs go to the other providers until one is saved here."
      />
      <ProviderKeyCard
        provider="apimart"
        settings={settings}
        description={
          <>
            APIMart runs many of these models at its own prices (Veo 3.1, Seedance, Wan, Kling 3.0, PixVerse, Nano Banana Pro, GPT Image 2…): with a key, a
            video goes there whenever it is the cheapest. Get one at <KeysLink provider="apimart" />.
          </>
        }
        offHint="No key yet. Runs go to the other providers until one is saved here."
      />
      <PreferenceCard settings={settings} />
    </>
  );
}
