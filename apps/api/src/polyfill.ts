// pdfjs-dist references DOMMatrix at module-level, which crashes Vercel's
// Node.js sandbox (where DOM globals are not exposed). This stub satisfies
// the module-init reference and the 2D matrix operations used during text
// extraction. Must be imported before any pdfjs-dist transitive dependency.
if (typeof (globalThis as any).DOMMatrix === "undefined") {
  class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    m11 = 1; m12 = 0; m13 = 0; m14 = 0;
    m21 = 0; m22 = 1; m23 = 0; m24 = 0;
    m31 = 0; m32 = 0; m33 = 1; m34 = 0;
    m41 = 0; m42 = 0; m43 = 0; m44 = 1;
    is2D = true;
    isIdentity = true;

    constructor(init?: number[] | string) {
      if (Array.isArray(init) && init.length === 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
        this.m11 = init[0]; this.m12 = init[1];
        this.m21 = init[2]; this.m22 = init[3];
        this.m41 = init[4]; this.m42 = init[5];
        this.isIdentity = init[0] === 1 && init[1] === 0 && init[2] === 0 &&
          init[3] === 1 && init[4] === 0 && init[5] === 0;
      }
    }

    multiply(other: any) { return new DOMMatrix([
      this.a * other.a + this.c * other.b,
      this.b * other.a + this.d * other.b,
      this.a * other.c + this.c * other.d,
      this.b * other.c + this.d * other.d,
      this.a * other.e + this.c * other.f + this.e,
      this.b * other.e + this.d * other.f + this.f,
    ]); }
    scale(sx: number, sy = sx) { return new DOMMatrix([sx, 0, 0, sy, 0, 0]); }
    translate(tx: number, ty: number) { return new DOMMatrix([1, 0, 0, 1, tx, ty]); }
    rotate(_angle: number) { return new DOMMatrix(); }
    inverse() { return new DOMMatrix(); }
    transformPoint(p?: { x?: number; y?: number }) {
      const x = p?.x ?? 0, y = p?.y ?? 0;
      return { x: this.a * x + this.c * y + this.e, y: this.b * x + this.d * y + this.f, z: 0, w: 1 };
    }
    toFloat32Array() { return new Float32Array([this.a, this.b, this.c, this.d, this.e, this.f]); }
    toFloat64Array() { return new Float64Array([this.a, this.b, this.c, this.d, this.e, this.f]); }
    toString() { return `matrix(${this.a},${this.b},${this.c},${this.d},${this.e},${this.f})`; }
  }
  (globalThis as any).DOMMatrix = DOMMatrix;
}
