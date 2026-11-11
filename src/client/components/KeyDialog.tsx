import { useEffect, useId, useState, type FormEvent } from "react";
import { CircleAlert, ExternalLink, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import type { ProviderId } from "@shared/types";
import * as api from "@/lib/api";
import { ApiClientError, describeApiError } from "@/lib/api";
import { KEY_VIA_SERVER, PROVIDER_KEYS, PROVIDER_NAME } from "@/lib/providers";
import { useSettings } from "@/store/settings";
import { useUi } from "@/store/ui";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/Dialog";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { KeyViaServerNote } from "@/components/KeyViaServerNote";

/** The key is checked before it is saved; only a clear rejection blocks it (an unreachable provider does not). */
async function checkKey(provider: ProviderId, key: string): Promise<string | null> {
  try {
    if (provider === "openrouter") await api.testSettings(key);
    else await api.testProviderKey(provider, key);
    return null;
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 401) return `${PROVIDER_NAME[provider]} rejected this key. Check it and try again.`;
    return null;
  }
}

/**
 * The small key dialog: one provider, one field. Opened by Generate when the chosen model's
 * provider has no key (then "Save and generate" finishes the job in one click) and by the Add key
 * pill. Everything else (testing, removing, credits, the provider choice) lives in Settings.
 */
export function KeyDialog() {
  const prompt = useUi((s) => s.keyPrompt);
  const close = useUi((s) => s.closeKeyDialog);
  const openSettings = useUi((s) => s.openSettings);
  const save = useSettings((s) => s.save);
  const [value, setValue] = useState("");
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const hintId = useId();
  const viaServerId = useId();

  const open = prompt !== null;
  const provider: ProviderId = prompt?.provider ?? "openrouter";
  const name = PROVIDER_NAME[provider];
  const copy = PROVIDER_KEYS[provider];
  const viaServer = KEY_VIA_SERVER[provider];
  const trimmed = value.trim();
  const continues = Boolean(prompt?.onSaved);

  // Start clean every time the dialog opens.
  useEffect(() => {
    if (open) return;
    setValue("");
    setReveal(false);
    setError(null);
  }, [open]);

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed || saving || !prompt) return;
    setSaving(true);
    setError(null);
    try {
      const problem = await checkKey(provider, trimmed);
      if (problem) {
        setError(problem);
        return;
      }
      await save(provider === "openrouter" ? { apiKey: trimmed } : { keys: { [provider]: trimmed } });
      const onSaved = prompt.onSaved;
      close();
      if (onSaved) onSaved();
      else toast.success(`${name} key saved`);
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent size="sm" className="max-w-[400px]">
        <DialogTitle>Add your {name} key</DialogTitle>
        <DialogDescription>
          {prompt?.reason ? `${prompt.reason} ` : ""}
          {viaServer ? "It stays in this browser." : `It stays in this browser and is only sent to ${copy.host}.`}
        </DialogDescription>

        <form onSubmit={(e) => void onSave(e)} className="mt-5" aria-describedby={hintId}>
          <label htmlFor={inputId} className="sr-only">
            {name} key
          </label>
          <Input
            id={inputId}
            type="text"
            masked={!reveal}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            placeholder={copy.placeholder}
            autoComplete="off"
            spellCheck={false}
            autoFocus
            aria-invalid={error ? true : undefined}
            aria-describedby={viaServer ? viaServerId : undefined}
            className="[&_input]:h-[34px] [&_input]:font-mono [&_input]:text-[13px]"
            rightSlot={
              <IconButton label={reveal ? "Hide key" : "Show key"} size="sm" onClick={() => setReveal((r) => !r)} aria-pressed={reveal} disabled={!value}>
                {reveal ? <EyeOff /> : <Eye />}
              </IconButton>
            }
          />
          {viaServer ? <KeyViaServerNote id={viaServerId} text={viaServer} /> : null}
          {error ? (
            <p role="alert" className="mt-2 flex items-start gap-1.5 text-meta text-danger">
              <CircleAlert size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : (
            <p id={hintId} className="mt-2 text-meta">
              Use a dedicated key with a spend limit.
            </p>
          )}

          <div className="mt-5 flex items-center gap-2">
            <a
              href={copy.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-fg-muted underline-offset-4 transition-colors hover:text-fg hover:underline"
            >
              Get a key <ExternalLink size={13} aria-hidden="true" />
              <span className="sr-only">(opens {copy.host} in a new tab)</span>
            </a>
            <Button type="submit" variant="primary" loading={saving} disabled={!trimmed} className="ml-auto h-[34px] font-semibold">
              {continues ? "Save and generate" : "Save key"}
            </Button>
          </div>
        </form>

        <p className="mt-5 border-t border-border pt-4 text-caption">
          <button
            type="button"
            onClick={() => openSettings("keys")}
            className="font-medium text-fg-muted underline-offset-4 transition-colors hover:text-fg hover:underline"
          >
            All settings
          </button>
          <span> · keys, library</span>
        </p>
      </DialogContent>
    </Dialog>
  );
}
