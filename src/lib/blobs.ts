/**
 * Receipts and documents need the bearer token, so images are fetched as blobs and shown through object URLs.
 * URLs are cached for the session per file and width, so stepping back and forth doesn't refetch.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '../app/core';

const cache = new Map<string, string>();

export async function blobUrl(url: string, w?: number): Promise<string> {
  const key = `${url}|${w ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = await api.blob(url, w ? { w } : undefined);
  const u = URL.createObjectURL(r.blob);
  cache.set(key, u);
  return u;
}

export function useBlobUrl(url: string | null | undefined, w?: number) {
  return useQuery({
    queryKey: ['blob', url, w ?? 0],
    enabled: !!url,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    retry: 1,
    queryFn: () => blobUrl(url!, w),
  });
}

/** Opens the stored original in a new tab. */
export async function openOriginal(url: string) {
  const tab = window.open('', '_blank');
  try {
    const u = await blobUrl(url);
    if (tab) tab.location.href = u;
    else window.open(u, '_blank');
  } catch (e) {
    tab?.close();
    throw e;
  }
}

export function clearBlobCache() {
  for (const u of cache.values()) URL.revokeObjectURL(u);
  cache.clear();
}
