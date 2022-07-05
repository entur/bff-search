export enum Locale {
    ENGLISH = 'eng',
    BOKMAL = 'nob',
    NYNORSK = 'nno',
}

export interface Translation {
    nob: string
    nno: string
    eng: string
}

export type I18n = (translation: Translation) => string

export function getI18n(locale: Locale): I18n {
    return (translation: Translation) => translation[locale]
}
