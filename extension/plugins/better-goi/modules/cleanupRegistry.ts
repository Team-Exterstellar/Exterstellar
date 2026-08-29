const trackedObservers = new Set<MutationObserver>();

export function trackObserver(observer: MutationObserver): MutationObserver {
  trackedObservers.add(observer);
  return observer;
}

export function disconnectTrackedObservers(): void {
  for (const obs of trackedObservers) obs.disconnect();
  trackedObservers.clear();
}
