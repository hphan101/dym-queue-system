import { vi } from './vi';
import { en } from './en';
import { ja } from './ja';
import type { SupportedLanguage, TranslationDictionary } from './types';

export * from './types';

export const translations: Record<SupportedLanguage, TranslationDictionary> = {
  vi,
  en,
  ja,
};

export function getTranslation(lang: SupportedLanguage): TranslationDictionary {
  return translations[lang] || translations.vi;
}

export function useTranslation(lang: SupportedLanguage): TranslationDictionary {
  return getTranslation(lang);
}

