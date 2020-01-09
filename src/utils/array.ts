
export function maxBy<T, S>(list: T[], getValue: (x: T) => S): T {
  return list.reduce(
    (max, next) => getValue(next) > getValue(max) ? next : max,
    list[0],
    )
}
export function minBy<T, S>(list: T[], getValue: (x: T) => S): T {
  return list.reduce(
    (min, next) => getValue(next) < getValue(min) ? next : min,
    list[0],
    )
}
