// Follows Meta Graph API cursor pagination (paging.next) so callers get the full
// result set instead of silently truncating at the first page's `limit`.
export async function fetchAllPages<T>(url: string, maxPages = 20): Promise<T[]> {
  let results: T[] = [];
  let next: string | undefined = url;
  let pages = 0;

  while (next && pages < maxPages) {
    const res = await fetch(next);
    const data: { data?: T[]; paging?: { next?: string }; error?: { message?: string } } = await res.json();
    if (data.error) throw new Error(data.error.message ?? "graph_api_error");
    results = results.concat(data.data ?? []);
    next = data.paging?.next;
    pages++;
  }

  return results;
}
