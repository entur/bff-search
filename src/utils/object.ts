export function clean<T>(obj: {[key: string]: T }): {[key: string]: Exclude<T, undefined> } {
    return Object.entries(obj).reduce((cleanObj, [key, value]) => {
        if (typeof value === 'undefined') {
            return cleanObj
        }

        return {
            ...cleanObj,
            [key]: value,
        }
    }, {})
}
