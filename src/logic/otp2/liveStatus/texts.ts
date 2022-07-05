import { Locale, Translation } from '../../../utils/locale'

export const minutesDelayed = (minutes: number): Translation => ({
    [Locale.BOKMAL]: `${minutes} minutter forsinket`,
    [Locale.NYNORSK]: `${minutes} minutt forseinka`,
    [Locale.ENGLISH]: `${minutes} minutes delayed`,
})

export const onTime: Translation = {
    [Locale.BOKMAL]: 'I rute',
    [Locale.NYNORSK]: 'I rute',
    [Locale.ENGLISH]: 'On time',
}

export const arrivedStop = (name: string, time: string): Translation => ({
    [Locale.BOKMAL]: `Stoppet ved ${name} kl. ${time}`,
    [Locale.NYNORSK]: `Stoppa ved ${name} kl. ${time}`,
    [Locale.ENGLISH]: `Stopped by ${name} at ${time}`,
})

export const passedStop = (name: string, time: string): Translation => ({
    [Locale.BOKMAL]: `Kjørte fra ${name} kl. ${time}`,
    [Locale.NYNORSK]: `Køyrde frå ${name} kl. ${time}`,
    [Locale.ENGLISH]: `Departed from ${name} at ${time}`,
})

export const departure = (name: string, time: string): Translation => ({
    [Locale.BOKMAL]: `Kjører fra ${name} kl. ${time}`,
    [Locale.NYNORSK]: `Køyrer frå ${name} kl. ${time}`,
    [Locale.ENGLISH]: `Departs from ${name} at ${time}`,
})

export const arrival = (name: string, time: string): Translation => ({
    [Locale.BOKMAL]: `Ankom ${name} kl. ${time}`,
    [Locale.NYNORSK]: `Ankom ${name} kl. ${time}`,
    [Locale.ENGLISH]: `Arrived at ${name} at ${time}`,
})
