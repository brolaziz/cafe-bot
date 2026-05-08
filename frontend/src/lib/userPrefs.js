const STORAGE_KEY = 'cafe_user_prefs_v1';

/** Buyurtma / admin xabarlarida ko'rinadigan qator */
export const PICKUP_FROM_CAFE_LABEL = "Kafedan olib ketish";

const defaultPrefs = () => ({
  displayName: '',
  phone: '',
  address: '',
  /** 'delivery' | 'pickup' — pickup bo'lsa manzil sifatida PICKUP_FROM_CAFE_LABEL yuboriladi */
  deliveryMode: 'delivery',
});

export function loadUserPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPrefs();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultPrefs();
    const deliveryMode = parsed.deliveryMode === 'pickup' ? 'pickup' : 'delivery';
    return {
      ...defaultPrefs(),
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : '',
      phone: typeof parsed.phone === 'string' ? parsed.phone : '',
      address: typeof parsed.address === 'string' ? parsed.address : '',
      deliveryMode,
    };
  } catch {
    return defaultPrefs();
  }
}

export function saveUserPrefs(partial) {
  const next = { ...loadUserPrefs(), ...partial };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
