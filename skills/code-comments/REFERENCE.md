# Code Comments — Reference Examples

## Bad: Comment Repeats the Code

```python
ptr_copy = get_copy(obj)            # Get pointer copy
if is_unlocked(ptr_copy):           # Is obj free?
    return obj                      # return current obj
```

These comments mirror the code line-by-line. They add nothing.

## Bad: Comment Uses Same Words as Entity Name

```java
/** Obtain a normalized resource name from REQ. */
private static String[] getNormalizedResourceNames(HTTPRequest req)

/** The horizontal padding of each line in the text. */
private static final int textHorizontalPadding = 4;
```

Missing: What is "normalized"? What are the array elements? Units? Both sides or one?

## Good: Lower-Level Precision (Variables)

```java
// BAD — too vague
// Current offset in resp Buffer
uint32_t offset;

// GOOD — precise
// Position in this buffer of the first object that hasn't
// been returned to the client.
uint32_t offset;
```

```java
// BAD — unclear key/value semantics
// Contains all line-widths inside the document and number of appearances.
private TreeMap<Integer, Integer> lineWidths;

// GOOD — documents structure, units, and missing-entry semantics
// Holds statistics about line lengths of the form <length, count>
// where length is the number of characters in a line (including
// the newline), and count is the number of lines with exactly
// that many characters. If there are no lines with a particular
// length, then there is no entry for that length.
private TreeMap<Integer, Integer> numLinesWithLength;
```

## Good: Nouns Not Verbs (Variables)

```java
// BAD — describes how the variable is manipulated
/* FOLLOWER VARIABLE: indicator variable that allows the Receiver and the
 * PeriodicTasks thread to communicate about whether a heartbeat has been
 * received within the follower's election timeout window.
 * Toggled to TRUE when a valid heartbeat is received.
 * Toggled to FALSE when the election timeout window is reset. */
private boolean receivedValidHeartbeat;

// GOOD — describes what the variable represents
/* True means that a heartbeat has been received since the last time
 * the election timer was reset. Used for communication between the
 * Receiver and PeriodicTasks threads. */
private boolean receivedValidHeartbeat;
```

## Good: Higher-Level Intuition (Implementation)

```java
// BAD — restates the conditions from the code
// If there is a LOADING readRpc using the same session
// as PKHash pointed to by assignPos, and the last PKHash
// in that readRPC is smaller than current assigning PKHash...

// GOOD — describes intent at a higher level
// Try to append the current key hash onto an existing
// RPC to the desired server that hasn't been sent yet.
```

## Good: Why + What (Implementation)

```java
// Some of the key hashes couldn't be looked up in this request
// (either because they aren't stored on the server, the server
// crashed, or there wasn't enough space in the response message).
// Mark the unprocessed hashes so they will get reassigned to new RPCs.
```

First sentence = **why** this code executes. Second sentence = **what** it does abstractly.

## Good: Class Interface Comment

```java
/**
 * This class implements a simple server-side interface to the HTTP
 * protocol: by using this class, an application can receive HTTP
 * requests, process them, and return responses. Each instance of
 * this class corresponds to a particular socket used to receive
 * requests. The current implementation is single-threaded and
 * processes one request at a time.
 */
public class Http {...}
```

Covers: abstraction, what instances represent, limitations. No implementation details.

## Good: TSDoc Class Comment (TypeScript)

```typescript
/**
 * Manages WebSocket connections to a single chat room, handling
 * message broadcasting, participant tracking, and reconnection.
 *
 * @remarks
 * Each instance binds to one room ID at construction time and cannot
 * be reassigned. Connections are lazily established on the first
 * `send()` call. Not thread-safe — use one instance per async context.
 */
export class ChatRoomChannel { ... }
```

## Good: TSDoc Method Comment (TypeScript)

```typescript
/**
 * Extracts a substring from the given text.
 *
 * @param text - The source string to extract from
 * @param start - Zero-based index of the first character to include (inclusive)
 * @param end - Zero-based index of the character after the last one to include
 *   (exclusive). Must be \>= `start`; if equal, returns an empty string.
 * @returns The extracted substring, or an empty string if the range is empty
 * @throws {@link RangeError} If `start` or `end` is negative or exceeds
 *   `text.length`
 *
 * @example
 * ```typescript
 * extractSubstring("hello world", 0, 5); // "hello"
 * extractSubstring("hello world", 5, 5); // ""
 * ```
 */
function extractSubstring(text: string, start: number, end: number): string
```

Note: the comment specifies inclusive/exclusive boundaries, edge case behavior, and
constraints between arguments — all things invisible from the signature alone.

## Good: TSDoc Variable/Property Comments (TypeScript)

```typescript
/**
 * Maximum number of bytes per second allowed on this connection
 * after throttling is applied. Zero means unlimited.
 */
readonly maxBandwidth: number;

/**
 * Tracks line-length distribution as `Map<charCount, numberOfLines>`.
 * Character count includes the trailing newline. Lengths with zero
 * occurrences have no entry.
 */
private readonly lineLengthHistogram: Map<number, number>;
```

## Good: Using Different Words

```java
// BAD
/** The horizontal padding of each line in the text. */
private static final int textHorizontalPadding = 4;

// GOOD
/** The amount of blank space to leave on the left and
 *  right sides of each line of text, in pixels. */
private static final int textHorizontalPadding = 4;
```

Adds: units (pixels), applies to both sides, explains "padding" in plain terms.

## Variable Precision Checklist

When commenting a variable, consider documenting:

- [ ] Units (pixels, bytes, seconds, characters)
- [ ] Boundary conditions (inclusive or exclusive)
- [ ] Null/zero/empty semantics
- [ ] Invariants ("always contains at least one entry")
- [ ] Ownership/cleanup responsibility
- [ ] Relationship to other variables

## Method Interface Checklist

When commenting a method, include:

- [ ] 1-2 sentence high-level behavior (caller's perspective)
- [ ] Each argument: meaning, constraints, valid ranges
- [ ] Return value: meaning, edge cases
- [ ] Side effects (state changes, I/O)
- [ ] Exceptions thrown and when
- [ ] Preconditions (what must be true before calling)
- [ ] Dependencies between arguments

## Design Review Through Comments

Use the act of writing comments to challenge and improve the design.

### Module Depth Check

If the interface comment is nearly as complex as the implementation, the module is **shallow**. Push for deep modules: simple interfaces that hide significant complexity. If you can't write a short, clear abstraction comment, the API surface is probably wrong.

### Shallow vs Deep Module

```typescript
// SHALLOW — interface is as complex as the implementation
/**
 * Fetches user data from the API, parses the JSON response,
 * validates the schema, normalizes the email field to lowercase,
 * checks for duplicate entries in the cache, and merges with
 * existing local state if present.
 */
function fetchUser(id: string): Promise<User>

// DEEP — simple interface hiding real complexity
/**
 * Returns the latest user profile, merging server and local state.
 * Handles caching, deduplication, and schema migration internally.
 */
function fetchUser(id: UserId): Promise<User>
```

If the comment has to explain the implementation to be useful, the abstraction is leaking.

### Parameter Scrutiny

For each parameter, ask:
- **Should this be optional?** If callers almost always pass a value, make it required. If a default is almost always correct, make it optional with `@defaultValue`.
- **Can the type be narrower?** Prefer `UserId` (branded type) over `string`. Prefer `"asc" | "desc"` over `string`. Prefer `NonEmptyArray<T>` over `T[]`.
- **Do parameters have hidden dependencies?** If `start` must be <= `end`, consider a `Range` type instead of two separate params.

### Type-Level Enforcement

Before writing a comment that says "must be X" or "only valid when Y", ask: **can TypeScript enforce this instead?**
- "Must be a positive number" → branded type `PositiveInt`
- "Only pass B when A is true" → discriminated union
- "This string is a URL" → branded type or `URL` object
- "Array must not be empty" → `[T, ...T[]]` tuple

If the type system can enforce it, do that AND document why. If it can't, the comment is essential.

### Type Narrowing Instead of Comments

```typescript
// BAD — comment doing the type system's job
/**
 * @param direction - Must be "asc" or "desc"
 * @param limit - Must be a positive integer
 * @param userId - Must be a valid UUID string
 */
function query(direction: string, limit: number, userId: string): Result[]

// GOOD — types enforce constraints, comments add meaning
type SortDirection = "asc" | "desc";
type PositiveInt = number & { readonly __brand: "PositiveInt" };
type UserId = string & { readonly __brand: "UserId" };

/**
 * Queries activity log entries for a user, sorted by timestamp.
 *
 * @param direction - Sort order relative to event timestamp
 * @param limit - Maximum entries to return (for pagination)
 * @param userId - The user whose activity to query
 */
function query(direction: SortDirection, limit: PositiveInt, userId: UserId): Result[]
```

### Discriminated Unions Over Optional Params

```typescript
// BAD — comment explains hidden dependency between params
/**
 * Sends a notification. If `schedule` is provided, `timezone`
 * must also be provided. If `schedule` is omitted, sends immediately
 * and `timezone` is ignored.
 */
function notify(msg: string, schedule?: Date, timezone?: string): void

// GOOD — type makes invalid states unrepresentable
type NotifyRequest =
  | { kind: "immediate"; msg: string }
  | { kind: "scheduled"; msg: string; schedule: Date; timezone: string };

/** Sends a notification immediately or at a scheduled time. */
function notify(request: NotifyRequest): void
```

### Design Smell Signals

When writing comments, flag these to the user:
- Interface comment requires mentioning implementation details → leaky abstraction
- Too many `@param` entries → function may need an options object or decomposition
- Comment says "if X, does Y; if Z, does W" → function may be doing two things
- Comment hedges with "usually" or "in most cases" → unclear contract

### Design Smell: Too Many Params

```typescript
// SMELL — comment is a wall of @params
/**
 * Creates a chart.
 * @param title - Chart title
 * @param subtitle - Optional subtitle
 * @param width - Width in pixels
 * @param height - Height in pixels
 * @param data - The dataset
 * @param colorScheme - Color palette name
 * @param animate - Whether to animate on render
 * @param legend - Show legend
 * @param tooltips - Enable tooltips
 */
function createChart(title: string, subtitle: string | undefined, ...): Chart

// BETTER — options object, comment stays focused
interface ChartConfig {
  /** Display title rendered above the chart area. */
  title: string;
  /** Optional subtitle below the title. Omit for compact layouts. */
  subtitle?: string;
  /** Dimensions in CSS pixels. */
  size: { width: number; height: number };
  // ... each field self-documents via TSDoc
}

/** Renders an interactive chart from the given configuration. */
function createChart(data: Dataset, config: ChartConfig): Chart
```
