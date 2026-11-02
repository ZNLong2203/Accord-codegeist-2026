import api, { route } from '@forge/api';
import { z } from 'zod';
import { contractSchema, type Contract } from '../domain/schema';

/**
 * Confirmed commitments live on the decision page itself, as a Confluence page
 * property. Anyone who can read them can already read the page; nothing derived
 * from page content is copied into Jira, where visibility may be broader.
 */
export const commitmentPropertyKey = 'accord-commitments';
const confirmationSchema = z.object({
  pageVersion: z.number().int().positive(),
  confirmedAt: z.string(),
  contract: contractSchema,
});
const propertySchema = z.object({
  schemaVersion: z.literal(1),
  confirmations: z.array(confirmationSchema).max(5),
});
export type Confirmation = z.infer<typeof confirmationSchema>;

interface StoredProperty {
  id: string;
  version: number;
  confirmations: Confirmation[];
}

export async function readConfirmations(pageId: string): Promise<StoredProperty | null> {
  const response = await api
    .asUser()
    .requestConfluence(route`/wiki/api/v2/pages/${pageId}/properties?key=${commitmentPropertyKey}`);
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(`Confluence returned HTTP ${response.status} for the page commitments.`);
  const body = await response.json();
  const raw = body?.results?.[0];
  if (!raw) return null;
  const parsed = propertySchema.safeParse(raw.value);
  // A malformed property is treated as absent: it can never produce a passing check.
  if (!parsed.success) return null;
  return {
    id: String(raw.id),
    version: Number(raw.version?.number ?? 1),
    confirmations: parsed.data.confirmations,
  };
}

export function contractAt(stored: StoredProperty | null, pageVersion: number): Contract | null {
  return stored?.confirmations.find((item) => item.pageVersion === pageVersion)?.contract ?? null;
}

export async function saveConfirmation(pageId: string, pageVersion: number, contract: Contract) {
  const existing = await readConfirmations(pageId);
  const value = {
    schemaVersion: 1 as const,
    confirmations: [
      ...(existing?.confirmations ?? []).filter((item) => item.pageVersion !== pageVersion),
      { pageVersion, confirmedAt: new Date().toISOString(), contract },
    ]
      .sort((a, b) => a.pageVersion - b.pageVersion)
      .slice(-5),
  };
  const response = existing
    ? await api
        .asUser()
        .requestConfluence(route`/wiki/api/v2/pages/${pageId}/properties/${existing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: commitmentPropertyKey,
            value,
            version: { number: existing.version + 1, message: 'Accord commitments confirmed' },
          }),
        })
    : await api.asUser().requestConfluence(route`/wiki/api/v2/pages/${pageId}/properties`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: commitmentPropertyKey, value }),
      });
  if (!response.ok)
    throw new Error(
      `Could not save the commitments (HTTP ${response.status}). Edit permission on the decision page is required.`,
    );
}
