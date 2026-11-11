import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, Eye, EyeOff, KeyRound, PlugZap, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ProviderId, SettingsResponse } from "@shared/types";
import * as api from "@/lib/api";
import { describeApiError } from "@/lib/api";
import { BYTEDANCE_ACTIVATE_URL } from "@/lib/bytedance";
import { formatUsd } from "@/lib/format";
import { KIE_CREDIT_USD } from "@/lib/kie";
import { KEY_VIA_SERVER, PROVIDER_KEYS, PROVIDER_NAME } from "@/lib/providers";
import { useSettings } from "@/store/settings";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { KeyViaServerNote } from "@/components/KeyViaServerNote";
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
  const viaServerId = useId();

  const name = PROVIDER_NAME[provider];
  const viaServer = KEY_VIA_SERVER[provider];
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
            aria-describedby={viaServer ? `${viaServerId} ${hintId}` : hintId}
            className="font-mono [&_input]:font-mono [&_input]:text-[12px]"
            rightSlot={
              <IconButton label={reveal ? "Hide key" : "Show key"} size="sm" onClick={() => setReveal((r) => !r)} aria-pressed={reveal} disabled={!value}>
                {reveal ? <EyeOff /> : <Eye />}
              </IconButton>
            }
          />
          {viaServer ? <KeyViaServerNote id={viaServerId} text={viaServer} /> : null}
          <p id={hintId} className="mt-2 text-meta">
            {hasKey ? (
              <>
                Using <span className="text-mono text-fg">{masked}</span>. Stored in this browser only.{viaServer ? "" : ` Sent only to ${name}.`}
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

/** A link that opens in a new tab: the provider's keys page by default, its url as the text unless `children` says otherwise. */
function KeysLink({ provider, href, children }: { provider: KeyedProvider; href?: string; children?: ReactNode }) {
  const url = href ?? PROVIDER_KEYS[provider].url;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="font-medium text-fg underline-offset-4 hover:underline">
      {children ?? url.replace(/^https:\/\//, "")}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** The fal, kie.ai, APIMart, Revana and ByteDance keys. */
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
            kie.ai runs many of these models for less (Veo 3.1, Kling 3.0, MiniMax H3, Wan, Grok Imagine, Nano Banana Pro…): with a key, a run goes there
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
            run goes there whenever it is the cheapest. Get one at <KeysLink provider="apimart" />.
          </>
        }
        offHint="No key yet. Runs go to the other providers until one is saved here."
      />
      <ProviderKeyCard
        provider="revana"
        settings={settings}
        description={
          <>
            Revana runs many of these models through one key at its own prices (Seedance, Veo 3.1, Kling 3.0 and 4.0, Wan, MiniMax H3, Nano Banana Pro,
            GPT Image 2…): with a key, a run goes there whenever it is the cheapest. Get one at <KeysLink provider="revana" />.
          </>
        }
        offHint="No key yet. Runs go to the other providers until one is saved here."
      />
      <ProviderKeyCard
        provider="bytedance"
        settings={settings}
        description={
          <>
            ByteDance runs its own Seedance models (2.5, 2.0, 2.0 Fast and 2.0 Mini) on BytePlus ModelArk: with a key, a run goes there whenever it is the
            cheapest. Get a key from <KeysLink provider="bytedance">BytePlus ModelArk</KeysLink>, then activate each Seedance model on its{" "}
            <KeysLink provider="bytedance" href={BYTEDANCE_ACTIVATE_URL}>
              activation page
            </KeysLink>
            . Not tried with a real key yet.
          </>
        }
        offHint="No key yet. Runs go to the other providers until one is saved here."
      />
    </>
  );
}
