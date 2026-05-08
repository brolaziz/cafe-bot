const STORAGE_KEY = 'cafe_user_prefs_v1';

const defaultPrefs = () => ({
  displayName: '',
  phone: '',
  address: '',
});

export function loadUserPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPrefs();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultPrefs();
    return {
      ...defaultPrefs(),
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : '',
      phone: typeof parsed.phone === 'string' ? parsed.phone : '',
      address: typeof parsed.address === 'string' ? parsed.address : '',
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
