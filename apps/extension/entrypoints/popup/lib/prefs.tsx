import React, { createContext, useContext, useEffect, useState } from 'react';
import { DICTS, type Lang, type MsgKey } from './i18n';
import { getSettings, setSettings } from './storage';

export interface Prefs {
  lang: Lang;
  privacy: boolean;
  setLang: (l: Lang) => void;
  setPrivacy: (v: boolean) => void;
  t: (k: MsgKey) => string;
  /** Mask a display value when privacy mode is on. */
  mask: (v: string) => string;
}

const Ctx = createContext<Prefs | null>(null);

export function usePrefs(): Prefs {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePrefs outside provider');
  return ctx;
}

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');
  const [privacy, setPrivacyState] = useState(false);

  useEffect(() => {
    getSettings().then((s) => {
      setLangState(s.lang ?? 'en');
      setPrivacyState(s.privacy ?? false);
    });
  }, []);

  const persist = async (patch: { lang?: Lang; privacy?: boolean }) => {
    const s = await getSettings();
    await setSettings({ ...s, ...patch });
  };

  const value: Prefs = {
    lang,
    privacy,
    setLang: (l) => {
      setLangState(l);
      void persist({ lang: l });
    },
    setPrivacy: (v) => {
      setPrivacyState(v);
      void persist({ privacy: v });
    },
    t: (k) => DICTS[lang][k],
    mask: (v) => (privacy ? '•••••' : v),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
