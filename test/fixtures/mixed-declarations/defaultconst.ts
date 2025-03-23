export interface A {
  name: string
}
export interface B {
  name: string
}
export interface C {
  name: string
}
export interface Options {
  a?: A
  b?: B
  c?: C
}

export type APrime = A

const Data = ['a', 'b', 'c'] as const
export type DataType = typeof Data[number]

export function plugin(options: Options = {}): Options {
  return options
}

export default Data
