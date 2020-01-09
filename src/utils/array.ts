export function maxBy<T, S>(list: T[], getValue: (x: T) => S): T {
  return bestBy(list, (x, y) => getValue(x) > getValue(y))
}

export function minBy<T, S>(list: T[], getValue: (x: T) => S): T {
  return bestBy(list, (x, y) => getValue(x) < getValue(y))
}

function bestBy<T>(list: T[], isBetter: (x: T, y: T) => boolean): T {
  return list.reduce((best, next) => isBetter(next, best) ? next : best)
}
