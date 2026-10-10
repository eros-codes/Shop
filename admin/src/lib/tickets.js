import { api } from './api';

// The sidebar shows how many tickets are waiting on support. Anything that
// changes a ticket's status fires this so the count follows straight away
// instead of on the next navigation.
export const TICKETS_CHANGED = 'tellcall:tickets-changed';

export function notifyTicketsChanged() {
  window.dispatchEvent(new Event(TICKETS_CHANGED));
}

// Replies come back oldest first, at most 100 a page. Reading only the first
// page would silently drop the newest messages - the ones support has to
// answer.
export async function fetchReplies(ticketId) {
  const first = await api.get(`/tickets/${ticketId}/replies?limit=100`, { auth: true });
  const totalPages = first?.totalPages ?? 1;
  if (totalPages <= 1) return first?.items ?? [];
  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      api.get(`/tickets/${ticketId}/replies?limit=100&page=${index + 2}`, { auth: true }),
    ),
  );
  return [first, ...rest].flatMap((data) => data?.items ?? []);
}
