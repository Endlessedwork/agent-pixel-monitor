/**
 * i18n — Bilingual support: Thai / English
 * Stores chosen language in localStorage under 'miniapp_language'.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type Language = 'th' | 'en';

// ── Translations ─────────────────────────────────────────────

const translations = {
  en: {
    settings: 'Settings',
    defaultAgent: 'Default Agent',
    defaultAgentDesc: 'Agent used for new conversations',
    notifications: 'Notification Settings',
    notificationsEnabled: 'Enable Notifications',
    notificationChannel: 'Channel',
    channelTelegram: 'Telegram',
    channelLine: 'LINE',
    language: 'Language',
    languageLabel: 'UI Language',
    save: 'Save',
    saved: 'Saved!',
    close: 'Close',
    activityLog: 'Activity Log',
    entries: 'entries',
    agents: 'agents',
    on: 'On',
    off: 'Off',
  },
  th: {
    settings: 'ตั้งค่า',
    defaultAgent: 'Agent หลัก',
    defaultAgentDesc: 'Agent ที่ใช้สำหรับสนทนาใหม่',
    notifications: 'การแจ้งเตือน',
    notificationsEnabled: 'เปิดการแจ้งเตือน',
    notificationChannel: 'ช่องทาง',
    channelTelegram: 'Telegram',
    channelLine: 'LINE',
    language: 'ภาษา',
    languageLabel: 'ภาษา UI',
    save: 'บันทึก',
    saved: 'บันทึกแล้ว!',
    close: 'ปิด',
    activityLog: 'ประวัติกิจกรรม',
    entries: 'รายการ',
    agents: 'agent',
    on: 'เปิด',
    off: 'ปิด',
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

// ── Context ──────────────────────────────────────────────────

interface I18nContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue>({
  lang: 'th',
  setLang: () => {},
  t: (key) => translations.th[key],
});

function getStoredLanguage(): Language {
  try {
    const v = localStorage.getItem('miniapp_language');
    if (v === 'en' || v === 'th') return v;
  } catch { /* ignore */ }
  return 'th';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(getStoredLanguage);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    try {
      localStorage.setItem('miniapp_language', next);
    } catch { /* ignore */ }
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => translations[lang][key] as string,
    [lang],
  );

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
