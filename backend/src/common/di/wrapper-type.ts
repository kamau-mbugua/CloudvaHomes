/**
 * Type for a constructor parameter injected with `forwardRef(() => X)` across an import cycle.
 *
 * Under native ES modules, `private readonly x: X` makes TypeScript emit a runtime reference to
 * `X` in the decorator metadata, which throws "Cannot access 'X' before initialization" when the
 * two files import each other. `WrapperType<X>` is the same type to the compiler but emits
 * `Object`, and `forwardRef` supplies the real token. (NestJS docs, circular dependency + ESM.)
 */
export type WrapperType<T> = T;
