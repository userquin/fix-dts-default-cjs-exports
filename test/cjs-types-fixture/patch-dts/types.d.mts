interface A {
    name: string;
}
interface B {
    name: string;
}
interface C {
    name: string;
}

interface Options {
    a?: A;
    b?: B;
    c?: C;
}

export type { A, B, C, C as CC, Options };
