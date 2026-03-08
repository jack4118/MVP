import { eventsApi, ProductEvent } from '../services/api';

const analyticsEnabled = import.meta.env.VITE_FEATURE_CORE_ANALYTICS !== 'false';

export const trackProductEvent = (event: ProductEvent, props?: Record<string, unknown>) => {
  if (!analyticsEnabled) {
    return;
  }

  eventsApi.track(event, props).catch(() => {
    // Non-blocking analytics call
  });
};
