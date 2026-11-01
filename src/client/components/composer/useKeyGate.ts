/**
 * Which key the selected model needs, for both composers. Generate stays clickable: when the
 * model's provider has no key, it opens the small key dialog for that provider, and "Save and
 * generate" runs the generation once the key is in. A model whose provider has no key while the
 * other one does also gets a notice above the prompt.
 */
import type { CatalogModel, ProviderId, SettingsResponse } from "@shared/types";
import { keyToAsk, modelProviders, PROVIDER_IDS, PROVIDER_NAME, type ProviderKeys } from "@/lib/providers";
import { useSettings } from "@/store/settings";
import { useUi } from "@/store/ui";

export interface KeyGate {
  /** Short notice above the prompt ("Kling 3.0 Motion Control runs on fal."), or undefined. */
  notice?: { message: string; action: string; onAction: () => void };
  /** Which providers have a key (for the composers' quotes). */
  keys: ProviderKeys;
  /** Opens the key dialog when the model's provider has no key; true means the caller should stop. */
  askForKey: (onSaved: () => void) => boolean;
}

/** Which providers have a key, from the settings' masked keys. */
export function keysOf(settings: Pick<SettingsResponse, "keys"> | null | undefined): ProviderKeys {
  return Object.fromEntries(PROVIDER_IDS.map((p) => [p, Boolean(settings?.keys[p])]));
}

function reasonFor(model: Pick<CatalogModel, "name" | "fal" | "kie" | "apimart" | "offOpenRouter">, provider: ProviderId, keys: ProviderKeys): string | undefined {
  // First run (no key at all) on a model OpenRouter serves: just ask for the key.
  if (!Object.values(keys).some(Boolean) && provider === "openrouter") return undefined;
  return modelProviders(model).length === 1 ? `${model.name} runs on ${PROVIDER_NAME[provider]}.` : undefined;
}

export function useKeyGate(model: CatalogModel | undefined): KeyGate {
  const settings = useSettings((s) => s.settings);
  const keys = keysOf(settings);
  const need = settings && model ? keyToAsk(model, keys) : undefined;
  const reason = model && need ? reasonFor(model, need, keys) : undefined;

  const open = (provider: ProviderId, why: string | undefined, onSaved?: () => void): void => {
    useUi.getState().openKeyDialog({ provider, ...(why ? { reason: why } : {}), ...(onSaved ? { onSaved } : {}) });
  };

  const gate: KeyGate = {
    keys,
    askForKey: (onSaved) => {
      // Read the store, not the render: after "Save and generate" this runs again with the new key.
      const s = useSettings.getState().settings;
      if (!s || !model) return false;
      const k = keysOf(s);
      const p = keyToAsk(model, k);
      if (!p) return false;
      open(p, reasonFor(model, p, k), onSaved);
      return true;
    },
  };
  if (need && reason) gate.notice = { message: reason, action: `Add ${PROVIDER_NAME[need]} key`, onAction: () => open(need, reason) };
  return gate;
}
