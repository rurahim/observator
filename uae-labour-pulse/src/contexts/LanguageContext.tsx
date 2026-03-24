import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

type Lang = 'en' | 'ar';

interface LanguageContextType {
  lang: Lang;
  dir: 'ltr' | 'rtl';
  toggleLang: () => void;
  t: (ar: string, en: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'en',
  dir: 'ltr',
  toggleLang: () => {},
  t: (_ar, en) => en,
});

export const useLanguage = () => useContext(LanguageContext);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLang] = useState<Lang>('en');
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  const toggleLang = useCallback(() => {
    setLang(prev => prev === 'en' ? 'ar' : 'en');
  }, []);

  const t = useCallback((ar: string, en: string) => lang === 'ar' ? ar : en, [lang]);

  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
  }, [dir, lang]);

  return (
    <LanguageContext.Provider value={{ lang, dir, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};
