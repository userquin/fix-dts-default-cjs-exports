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

export const Data = ['a', 'b', 'c'] as const
export type DataType = typeof Data[number]

export default class DefaultClass {
  public a: A
  public b: B
  public c: C
  constructor(a: A, b: B, c: C) {
    this.a = a
    this.b = b
    this.c = c
  }

  options(options: Options): Options {
    return options
  }

  alias(aPrime: APrime): APrime {
    return aPrime
  }

  data(data: DataType): DataType {
    return data
  }
}
