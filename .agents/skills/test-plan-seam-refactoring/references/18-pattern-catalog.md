# 18 Pattern Catalog

Use this file when the inline planner is not enough and a task needs the full per-pattern decision aid.

Applicability labels:

- `Most Applicable`: usually an idiomatic first-class seam in that ecosystem
- `Situational`: viable when the code already has the right structure or constraints
- `Usually Not Applicable`: generally avoid; prefer simpler substitution mechanisms

## Pattern Summaries

### 1. Subclass and Override Method

- Solves: Hardcoded Variable in Method
- Use when: a problematic call can be isolated behind an overridable method
- Result: tests override the method while production keeps the default behavior
- Applicability: TypeScript `Situational` | Python `Situational` | C# `Most Applicable` | Go `Usually Not Applicable`

### 2. Extract Interface

- Solves: Difficult Parameter
- Use when: code depends on a concrete type that is hard to instantiate or fake
- Result: tests supply a fake implementation behind a minimal interface
- Applicability: TypeScript `Most Applicable` | Python `Situational` | C# `Most Applicable` | Go `Most Applicable`

### 3. Parameterize Constructor

- Solves: Hardcoded Instance Variable in Constructor
- Use when: the dependency is created in the constructor
- Result: production keeps the default dependency, tests pass a fake explicitly
- Applicability: TypeScript `Most Applicable` | Python `Most Applicable` | C# `Most Applicable` | Go `Most Applicable`

### 4. Parameterize Method

- Solves: Hardcoded Variable in Method
- Use when: the dependency is created inside a method and can be supplied from outside
- Result: original method behavior remains intact through a default parameter path
- Applicability: TypeScript `Most Applicable` | Python `Most Applicable` | C# `Most Applicable` | Go `Most Applicable`

### 5. Extract and Override Call

- Solves: Hardcoded Variable in Method
- Use when: one direct call is the blocker and a small overridable wrapper is enough
- Result: tests override the call site instead of rewriting the method
- Applicability: TypeScript `Situational` | Python `Situational` | C# `Most Applicable` | Go `Usually Not Applicable`

### 6. Extract and Override Factory Method

- Solves: Hardcoded Instance Variable in Constructor
- Use when: constructor object creation should stay internal but become replaceable in tests
- Result: tests override object creation through a factory seam
- Applicability: TypeScript `Situational` | Python `Situational` | C# `Most Applicable` | Go `Usually Not Applicable`

### 7. Extract and Override Getter

- Solves: Hardcoded Constructor or Method dependency
- Use when: lazy access is safer than constructor-time overriding
- Result: the dependency is exposed through an overridable getter
- Applicability: TypeScript `Situational` | Python `Situational` | C# `Most Applicable` | Go `Usually Not Applicable`

### 8. Introduce Static Setter

- Solves: Local Variable Hardcoded to Singleton
- Use when: singleton access blocks tests and controlled replacement is acceptable
- Result: tests inject a fake singleton and reset it afterward
- Applicability: TypeScript `Situational` | Python `Situational` | C# `Most Applicable` | Go `Usually Not Applicable`

### 9. Supersede Instance Variable

- Solves: Hardcoded Instance Variable in Constructor
- Use when: constructor behavior cannot be intercepted cleanly but state can be replaced after construction
- Result: tests replace the instance variable explicitly before execution
- Applicability: TypeScript `Situational` | Python `Situational` | C# `Situational` | Go `Situational`

### 10. Adapt Parameter

- Solves: Difficult Parameter
- Use when: the external parameter type cannot be changed directly
- Result: production wraps the difficult type in an adapter and tests use a fake adapter
- Applicability: TypeScript `Most Applicable` | Python `Situational` | C# `Most Applicable` | Go `Most Applicable`

### 11. Primitivize Parameter

- Solves: Difficult Parameter with Primitive Access
- Use when: the essential logic can be expressed in primitives rather than the difficult external type
- Result: tests call the primitive-facing method directly
- Applicability: TypeScript `Most Applicable` | Python `Most Applicable` | C# `Most Applicable` | Go `Most Applicable`

### 12. Break Out Method Object

- Solves: Long Method in Difficult Class
- Use when: a large algorithm is trapped inside a hard-to-instantiate class
- Result: the algorithm moves to a smaller object with a focused constructor and executable method
- Applicability: TypeScript `Situational` | Python `Situational` | C# `Most Applicable` | Go `Situational`

### 13. Expose Static Method

- Solves: Independent Method in Difficult Class
- Use when: the method does not depend on instance state
- Result: tests call the extracted static method without instantiating the difficult class
- Applicability: TypeScript `Situational` | Python `Situational` | C# `Most Applicable` | Go `Usually Not Applicable`

### 14. Pull Up Feature

- Solves: Difficult Unrelated Method
- Use when: useful logic is trapped next to hard dependencies that it does not need
- Result: the testable logic moves to a superclass or shared parent
- Applicability: TypeScript `Situational` | Python `Situational` | C# `Situational` | Go `Usually Not Applicable`

### 15. Push Down Dependency

- Solves: Difficult Unrelated Method
- Use when: only some methods truly need the heavy dependency
- Result: the dependency is moved into a subclass, leaving a lighter base for tests
- Applicability: TypeScript `Situational` | Python `Situational` | C# `Situational` | Go `Usually Not Applicable`

### 16. Encapsulate Global Reference

- Solves: Method Using Globals as Parameters
- Use when: global access must be wrapped before finer seams can be introduced
- Result: tests replace or fake the wrapper instead of the raw global
- Applicability: TypeScript `Most Applicable` | Python `Most Applicable` | C# `Most Applicable` | Go `Most Applicable`

### 17. Replace Global Reference with Getter

- Solves: Local Variable Hardcoded to Global
- Use when: a global dependency can be isolated behind a getter
- Result: tests override or replace access to the global dependency
- Applicability: TypeScript `Situational` | Python `Situational` | C# `Most Applicable` | Go `Situational`

### 18. Introduce Instance Delegator

- Solves: Difficult Static Method
- Use when: static behavior must become instance-based to allow test substitution
- Result: tests provide a fake delegator while production keeps the static entry point thin
- Applicability: TypeScript `Situational` | Python `Situational` | C# `Most Applicable` | Go `Situational`

## Pattern Selection Notes

- Prefer a lower-blast-radius seam over a more abstract one.
- Prefer constructor or method parameterization when it solves the blocker directly.
- Use hierarchy-based seams only when simpler substitution is not enough.
- Treat globals and singletons as higher-risk seams that require stronger isolation discipline.
