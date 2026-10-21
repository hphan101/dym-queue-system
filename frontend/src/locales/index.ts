import { vi } from './vi';
import { en } from './en';
import type { SupportedLanguage, TranslationDictionary } from './types';

export * from './types';

export const translations: Record<SupportedLanguage, TranslationDictionary> = {
  vi,
  en,
};
