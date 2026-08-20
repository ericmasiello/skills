# Legacy Code Testing Rules

> _"Code without tests is bad code. It doesn't matter how well written it is; it doesn't matter how pretty or object-oriented or well-encapsulated it is. With tests, we can change the behavior of our code quickly and verifiably. Without them, we really don't know if our code is getting better or worse."_
>
> — Michael C. Feathers, _Working Effectively with Legacy Code_

This document provides comprehensive rules and techniques for adding tests to legacy code with specialized strategies for code that was written without tests or is lacking tests.

---

## Table of Contents

1. [Philosophy and Mindset](#philosophy-and-mindset)
2. [The Paradox of Legacy Code](#the-paradox-of-legacy-code)
3. [The Seam Model](#the-seam-model)
4. [Legacy Code Smells](#legacy-code-smells)
5. [Seam Refactorings Catalog](#seam-refactorings-catalog)
6. [Characterization Testing](#characterization-testing)
7. [Golden Master and Approval Testing](#golden-master-and-approval-testing)
8. [Mock Discipline for Legacy Code](#mock-discipline-for-legacy-code)
9. [The 4-Stage Workflow](#the-4-stage-workflow)
10. [Fallback Strategies](#fallback-strategies)
11. [Language-Specific Patterns](#language-specific-patterns)
12. [Quality Indicators](#quality-indicators)

---

## Philosophy and Mindset

### "Old" Does Not Mean "Ugly"

Legacy code is like an old car that did not have much maintenance. It still runs, but it is arduous and risky to use. Even so, using the right tools and skills, it is possible to restore it and make it shine again! It might not become a Ferrari, but it can be safe to drive and still take us very far.

### Prepare Yourself

To be effective with legacy code, you need specific preparation. When there are no tests in place, everything becomes more hazardous. You must act more like a surgeon than a plumber.

Three critical things are needed to "arm" yourself for fighting legacy code:

1. **The Armor** (Tests) — What protects you from regression and undesired outcomes
2. **Shield and Sword** (IDE Refactorings) — Automated, safe transformations
3. **Skills** (Techniques) — The seam model, characterization testing, and refactoring patterns

### Do Not Do It in Isolation

The testless nature of legacy code makes it very hard to understand the consequences of your actions. It is like doing brain surgery: ideally, you want as many experts as you can find in the room.

**Collaborative programming is essential when dealing with legacy code.**

- Pair programming reduces risk of costly mistakes
- Domain experts understand hidden business rules
- Multiple perspectives catch edge cases
- Psychological safety prevents burnout

---

## The Paradox of Legacy Code

Legacy Code brings an inherent paradox:

> "Before we can change the code, we must have tests in place. But to put tests in place, we must change the code."

### The Solution

**With no tests in place, changes should be:**

1. **Minimal** — Smallest possible change to enable testing
2. **IDE-driven** — Use automated refactorings when possible
3. **Behavior-preserving** — Never change what the code does
4. **Goal-oriented** — Only purpose is to put tests in place

```
┌─────────────────────────────────────────────────────────────────┐
│                    THE LEGACY CODE PARADOX                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────────┐         ┌──────────────┐                     │
│   │  Need Tests  │ ──────► │ Must Change  │                     │
│   │  to Refactor │         │    Code      │                     │
│   └──────────────┘         └──────────────┘                     │
│          ▲                        │                             │
│          │                        ▼                             │
│          │                 ┌──────────────┐                     │
│          └──────────────── │  Need Tests  │                     │
│                            │  to Change   │                     │
│                            └──────────────┘                     │
│                                                                 │
│   SOLUTION: Minimal, IDE-driven, behavior-preserving seams      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## The Seam Model

### What is a Seam?

> "A seam is a place where you can alter behavior in your program without editing in that place."
>
> — Michael C. Feathers

In clothing, a seam joins parts together to form a piece of clothing. In code, we use this concept to find weak points where we can separate coupled components.

### Why Seams Matter

Legacy code often has costly side effects (payment systems, financial transactions, external APIs). The seam model allows us to:

1. Segregate external dependencies
2. Avoid changing system design prematurely
3. Put tests in place safely
4. Enable gradual improvement

### Types of Seams

| Seam Type               | Mechanism                             | Use Case                    |
| ----------------------- | ------------------------------------- | --------------------------- |
| **Object Seam**         | Polymorphism, inheritance, interfaces | Most common in OO languages |
| **Link Seam**           | Intercepting calls at link time       | C/C++ with linker tricks    |
| **Pre-Processing Seam** | Macros, preprocessor directives       | C/C++ with #ifdef           |

**This document focuses on Object Seams** — the most universally applicable technique.

### The Seam Workflow

```
┌──────────────────────────────────────────────────────────────┐
│                         SEAM WORKFLOW                        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. IDENTIFY           2. INTRODUCE           3. TEST        │
│  ┌──────────┐          ┌──────────┐          ┌──────────┐    │
│  │  Smell   │ ───────► │   Seam   │ ───────► │  Write   │    │
│  │ (Problem)│          │(Solution)│          │  Tests   │    │
│  └──────────┘          └──────────┘          └──────────┘    │
│                                                     │        │
│                                                     ▼        │
│                                              4. REFACTOR     │
│                                              ┌──────────┐    │
│                                              │  Improve │    │
│                                              │  Design  │    │
│                                              └──────────┘    │
└──────────────────────────────────────────────────────────────┘
```

---

## Legacy Code Smells

Legacy Code Smells are **problems** that make code untestable. Unlike regular code smells (which indicate poor design), legacy code smells specifically **prevent testing**.

### Smell Taxonomy Overview

| Category             | Smells | Core Problem                      |
| -------------------- | ------ | --------------------------------- |
| **Difficult Class**  | 2      | Cannot instantiate class in tests |
| **Hardcoded Values** | 2      | Cannot substitute dependencies    |
| **Types**            | 2      | Cannot fake parameters            |
| **Globals**          | 3      | Cannot isolate side effects       |
| **Static**           | 1      | Cannot override behavior          |
| **Cross-Methods**    | 1      | Unrelated methods block testing   |

**Total: 11 Legacy Code Smells in 6 Categories**

---

### Category 1: Difficult Class

When a class is difficult to instantiate, it cannot be referenced in the test project.

#### Smell 1.1: Long Method in Difficult Class

**Problem**: The method we want to test is long and belongs to a class that is difficult to instantiate.

```java
// ❌ UNTESTABLE: DrawingCanvas requires many dependencies
public class DrawingCanvas {
    // Complex constructor with many dependencies
    public DrawingCanvas(/* ...lots of dependencies... */) {
        throw new RuntimeException("This class is too difficult to create");
    }

    // We want to test this method, but can't instantiate the class
    public void drawPoints(List<Point2D> points, Color[] colors) {
        int i = 0;
        for (Point2D point : points) {
            double x = point.getX();
            double y = point.getY();
            if (x >= MIN_X && x <= MAX_X && y >= MIN_Y && y <= MAX_Y) {
                drawPoint(x, y, colors[i]);
            }
            i++;
        }
    }
}
```

**Recommended Refactoring**: Break Out Method Object

---

#### Smell 1.2: Independent Method in Difficult Class

**Problem**: The method we want to test doesn't use instance variables but belongs to a class that is difficult to instantiate.

```java
// ❌ UNTESTABLE: Method doesn't need instance state but class is hard to create
public class DrawingCanvas {
    public DrawingCanvas(/* ...lots of dependencies... */) {
        throw new RuntimeException("This class is too difficult to create");
    }

    // This method is INDEPENDENT - uses no instance variables
    // But we still can't test it because class is hard to instantiate
    public List<Point2D> translatePoints(List<Point2D> points,
                                         int xOffset, int yOffset) {
        List<Point2D> translatedPoints = new ArrayList<>();
        for (Point2D point : points) {
            translatedPoints.add(new Point2D.Double(
                point.getX() + xOffset,
                point.getY() + yOffset
            ));
        }
        return translatedPoints;
    }
}
```

**Recommended Refactoring**: Expose Static Method

---

### Category 2: Hardcoded Values

Hardcoded values and dependencies work well under delivery pressure but inhibit flexibility for features and tests. They increase immobility and fragility of design.

#### Smell 2.1: Hardcoded Instance Variable in Constructor

**Problem**: A class we want to test has a hardcoded instance variable initialized in the constructor.

```java
// ❌ UNTESTABLE: State is hardcoded in constructor
public class Pager {
    private PAGER_STATE state;

    public Pager() {
        // SMELL: Hardcoded state prevents testing other scenarios
        state = PAGER_STATE.BUSY;
        reset();
    }

    public void sendMessage(String address, String message) {
        formConnection();  // Throws if state != READY
        // ...
    }

    protected void formConnection() {
        if (state != PAGER_STATE.READY) {
            throw new RuntimeException("I am not ready");
        }
        // nasty low level code...
    }
}
```

**Recommended Refactorings**:

- Supersede Instance Variable
- Parameterize Constructor
- Extract and Override Factory Method

---

#### Smell 2.2: Hardcoded Variable in Method

**Problem**: A method we want to test has a hardcoded variable that cannot be substituted.

```java
// ❌ UNTESTABLE: PaymentResult is created internally
public class Payment {
    public void process() {
        int attempts = 0;
        // SMELL: Cannot inject test double for result
        result = new PaymentResult();
        while (attempts < MAX_ATTEMPTS) {
            try {
                provider.accept(this);
            } catch (Exception exception) {
                result.addFailure(exception);
            } finally {
                attempts++;
            }
        }
    }
}
```

**Recommended Refactorings**:

- Subclass and Override Method
- Parameterize Method
- Extract and Override Call

---

### Category 3: Types (Difficult Parameters)

Statically typed languages can help us "make illegal state unrepresentable" through custom types. Unfortunately, this can also prevent testing if we use types we don't own, or if their instantiation is too hard.

#### Smell 3.1: Difficult Parameter

**Problem**: A method we want to test has a parameter that is difficult to instantiate.

```java
// ❌ UNTESTABLE: RemoteSalesApiRequest belongs to external API
public class SalesReportingService {
    // We can't create RemoteSalesApiRequest in tests
    public String createConsoleReport(RemoteSalesApiRequest request) {
        return String.format("Q 1: %s | Q 2: %s | Q 3: %s | Q 4: %s",
                request.Q1Total, request.Q2Total,
                request.Q3Total, request.Q4Total);
    }
}
```

**Recommended Refactorings**:

- Adapt Parameter
- Extract Interface
- Extract Implementer

---

#### Smell 3.2: Difficult Parameter with Primitive Access

**Problem**: A method we want to test has a parameter we want to check, but the logic can be expressed with primitives.

```java
// ❌ UNTESTABLE: External type, but logic only needs primitive values
public class SalesReportingService {
    public String createMultiYearConsoleReport(
            RemoteMultiYearSalesApiResponse response) {
        // Only accesses primitive properties from response
        // ...
    }
}
```

**Recommended Refactoring**: Primitivize Parameter

---

### Category 4: Globals

Access to global instances provides shortcuts for deadlines but pierces layers of abstraction, complicates code, and creates race conditions that are difficult to debug.

#### Smell 4.1: Local Variable Hardcoded to Singleton

**Problem**: A method we want to test has a local variable hardcoded to a Singleton.

```java
// ❌ UNTESTABLE: Depends on production-only singleton
public class MessageRouter {
    public void route(String message) {
        // SMELL: ExternalRouter.instance() only works in production
        Dispatcher dispatcher = ExternalRouter.instance().getDispatcher();
        if (dispatcher != null) {
            dispatcher.sendMessage(message);
        }
    }
}
```

**Recommended Refactoring**: Introduce Static Setter

---

#### Smell 4.2: Local Variable Hardcoded to Global

**Problem**: A method we want to test has a local variable hardcoded to a Global reference.

```java
// ❌ UNTESTABLE: Depends on Inventory global
public class RegisterSale {
    public void addItem(Barcode code) {
        // SMELL: Global reference prevents test isolation
        SaleItem item = Inventory.getInventory().itemForBarcode(code);
        ITEMS.add(item);
    }
}
```

**Recommended Refactoring**: Replace Global Reference with Getter

---

#### Smell 4.3: Method Using Globals as Parameters

**Problem**: A method we want to test has Globals as parameters to internal methods.

```java
// ❌ UNTESTABLE: Methods use Globals directly
public class DrawingCanvas {
    public void suspendFrame() {
        // SMELL: Global references as parameters
        frameCopy(Globals.suspendedFrame, Globals.activeFrame);
        clear(Globals.suspendedFrame);
    }
}
```

**Recommended Refactoring**: Encapsulate Global Reference

---

### Category 5: Static

Static methods can provide performance boosts. Using them for something different than a referentially-transparent function is problematic. When found in a class, it's either a misplaced responsibility or accessing an external dependency.

#### Smell 5.1: Difficult Static Method

**Problem**: A method we want to test uses a Static Method that invokes an external dependency.

```java
// ❌ UNTESTABLE: Static method only works in production
public class BankingServices {
    public static void withdraw(int userId, BigDecimal amount) {
        // ...
        updateAccountBalance(userId, amount);  // Static, production-only
        // ...
    }

    // SMELL: Cannot substitute this in tests
    public static void updateAccountBalance(int userId, BigDecimal amount) {
        throw new RuntimeException("This method will only work in production");
    }
}
```

**Recommended Refactoring**: Introduce Instance Delegator

---

### Category 6: Cross-Methods

When classes have no clear responsibilities, they end up having methods entangled with each other because they share access to a dependency. This complicates implementation and testing.

#### Smell 6.1: Difficult Unrelated Method

**Problem**: A class we want to test has dependencies that make it difficult to instantiate, but we only want to test methods that don't use those dependencies.

```java
// ❌ UNTESTABLE: validate() prevents instantiation, but getDeadTime() doesn't need it
public class Scheduler {
    private List<ScheduleItem> items = new ArrayList<>();

    // This method blocks testing of the whole class
    private void validate(ScheduleItem item) throws ConflictException {
        // ... calls a database
        throw new RuntimeException("This can only run in production");
    }

    // We want to test THIS method, but can't because of validate()
    public int getDeadTime() {
        int result = 0;
        for (ScheduleItem item : items) {
            // ... calculation logic we want to test
        }
        return result;
    }
}
```

**Recommended Refactorings**:

- Pull Up Feature
- Push Down Dependency

---

### Smell → Refactoring Quick Reference

| Legacy Code Smell                         | Recommended Refactorings                                                                   | Priority |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ | -------- |
| Long Method in Difficult Class            | Break Out Method Object                                                                    | HIGH     |
| Independent Method in Difficult Class     | Expose Static Method                                                                       | MEDIUM   |
| Hardcoded Instance Variable (Constructor) | Parameterize Constructor, Extract and Override Factory Method, Supersede Instance Variable | HIGH     |
| Hardcoded Variable (Method)               | Parameterize Method, Extract and Override Call, Subclass and Override Method               | HIGH     |
| Difficult Parameter                       | Extract Interface, Adapt Parameter                                                         | MEDIUM   |
| Difficult Parameter + Primitive Access    | Primitivize Parameter                                                                      | MEDIUM   |
| Local Variable → Singleton                | Introduce Static Setter                                                                    | CRITICAL |
| Local Variable → Global                   | Replace Global Reference with Getter                                                       | HIGH     |
| Method using Globals as Parameters        | Encapsulate Global Reference                                                               | HIGH     |
| Difficult Static Method                   | Introduce Instance Delegator                                                               | MEDIUM   |
| Difficult Unrelated Method                | Pull Up Feature, Push Down Dependency                                                      | LOW      |

---

## Seam Refactorings Catalog

These are the 18 refactorings from Michael Feathers' _Working Effectively with Legacy Code_. Each refactoring is a **solution** to one or more **legacy code smells**.

### The "Mother of All Refactorings": Subclass and Override Method

This technique depicts the main underlying idea of the seam model. Many other dependency-breaking techniques are variations on this one.

#### The Pattern

**Step 1**: Add a protected virtual method to encapsulate the problematic behavior.

```csharp
// Before: Coupled to Random
public class Game {
    public void Play() {
        var diceResult = new Random().Next(1, 6);
        // ...
    }
}

// After: Seam introduced
public class Game {
    public void Play() {
        var diceResult = Roll();
        // ...
    }

    protected virtual int Roll() {
        return new Random().Next(1, 6);
    }
}
```

**Step 2**: In test code, inherit and override the protected method.

```csharp
public class TestableGame : Game {
    private int roll;

    public TestableGame(int desiredRoll) {
        roll = desiredRoll;
    }

    protected override int Roll() {
        return roll;
    }
}
```

**Step 3**: Write tests using the testable subclass.

```csharp
[Test]
public void Do_Something_When_A_Six_Is_Rolled() {
    var game = new TestableGame(6);

    game.Play();

    // ASSERT...
}
```

**Advantage**: Can be performed entirely with IDE automated refactorings, reducing risk of introducing bugs.

---

### Refactoring Catalog

#### 1. Subclass and Override Method

**Solves**: Hardcoded Variable in Method

**When**: Testing a class without heavy dependencies but with internal method calls to problematic code.

**Steps**:

1. Identify dependencies to separate or places to sense
2. Find the smallest set of methods to override
3. Make each method overridable (protected virtual)
4. Adjust visibility for subclass access
5. Create subclass that overrides methods
6. Verify you can instantiate in test harness

---

#### 2. Extract Interface

**Solves**: Difficult Parameter

**When**: Testing a class with dependencies on concrete objects that are hard to instantiate.

**Steps**:

1. Create new interface with desired name (no methods yet)
2. Make original class implement the interface
3. Change usage site to use interface type
4. Compile and add method declarations for each error

---

#### 3. Parameterize Constructor

**Solves**: Hardcoded Variable in Constructor

**When**: Testing code that depends on an object created in the constructor.

**Steps**:

1. Identify constructor to parameterize, make a copy
2. Add parameter for the object creation to replace
3. Remove object creation, assign from parameter
4. Original constructor calls new constructor with default creation

```typescript
// Before
class OrderProcessor {
  private db: Database;
  constructor() {
    this.db = new PostgresDatabase(); // Hardcoded
  }
}

// After (SEAM)
class OrderProcessor {
  constructor(private db: Database = new PostgresDatabase()) {}
}

// Test
const processor = new OrderProcessor(new FakeDatabase());
```

---

#### 4. Parameterize Method

**Solves**: Hardcoded Variable in Method

**When**: Testing code that depends on an object created inside a method.

**Steps**:

1. Identify method, make a copy
2. Add parameter for object creation to replace
3. Remove creation, assign from parameter
4. Original method calls parameterized version with default

---

#### 5. Extract and Override Call

**Solves**: Hardcoded Variable in Method

**When**: Testing a class that depends on a single method call.

**Steps**:

1. Identify call to extract, copy method signature (Preserve Signatures)
2. Create new protected virtual method with copied signature
3. Copy call to new method, replace original with call to new method
4. In tests, subclass and override

```java
// Before
public class Order {
    public void process() {
        Date now = new Date();  // Non-deterministic
        // ...
    }
}

// After (SEAM)
public class Order {
    public void process() {
        Date now = getCurrentTime();
        // ...
    }

    protected Date getCurrentTime() {
        return new Date();
    }
}

// Test
class TestableOrder extends Order {
    @Override
    protected Date getCurrentTime() {
        return FIXED_DATE;
    }
}
```

---

#### 6. Extract and Override Factory Method

**Solves**: Hardcoded Variable in Constructor

**When**: Testing a class with hardcoded dependencies created in the constructor.

**Steps**:

1. Identify object creation in constructor
2. Extract creation work into factory method
3. Create testing subclass that overrides factory method

---

#### 7. Extract and Override Getter

**Solves**: Hardcoded Variable in Constructor, Hardcoded Variable in Method

**When**: Testing code that depends on objects created in constructor, especially when language doesn't support virtual calls from base constructor.

**Steps**:

1. Identify object needing a getter
2. Extract creation logic into getter
3. Replace all uses with getter calls
4. Initialize reference to null in constructors
5. Add lazy initialization in getter
6. Subclass and override getter in tests

---

#### 8. Introduce Static Setter

**Solves**: Local Variable Hardcoded to Singleton

**When**: Testing a class with dependencies on a Singleton.

**Steps**:

1. Decrease constructor protection to allow subclassing
2. Add static setter accepting reference to singleton type
3. Consider subclassing or extracting interface for test setup

```java
// Before: Singleton prevents testing
public class ConfigManager {
    private static ConfigManager instance;
    private ConfigManager() {}

    public static ConfigManager instance() {
        if (instance == null) instance = new ConfigManager();
        return instance;
    }
}

// After (SEAM)
public class ConfigManager {
    private static ConfigManager instance;
    protected ConfigManager() {}  // Accessible to subclass

    public static ConfigManager instance() {
        if (instance == null) instance = new ConfigManager();
        return instance;
    }

    public static void setInstance(ConfigManager replacement) {
        instance = replacement;
    }
}

// Test
ConfigManager.setInstance(new FakeConfigManager());
```

---

#### 9. Supersede Instance Variable

**Solves**: Hardcoded Instance Variable in Constructor

**When**: You can't override a virtual function call in the constructor.

**Steps**:

1. Identify instance variable to supersede
2. Create method `supersedeXXX` where XXX is variable name
3. In method, destroy previous instance and set new value
4. Verify no other references to old object

---

#### 10. Adapt Parameter

**Solves**: Difficult Parameter

**When**: Can't use Extract Interface on a parameter's class, or parameter is difficult to fake.

**Steps**:

1. Create new simple interface for method's needs
2. Create production implementer wrapping original type
3. Create fake implementer for tests
4. Write test using fake
5. Change method to use new interface
6. Verify tests pass with fake

---

#### 11. Primitivize Parameter

**Solves**: Difficult Parameter with Primitive Access

**When**: Testing logic where computation can be expressed with primitives, but parameter type is external.

**Steps**:

1. Develop free function doing the work with primitives
2. Develop intermediate representation for the work
3. Add function to class that builds representation and delegates

---

#### 12. Break Out Method Object

**Solves**: Long Method in Difficult Class

**When**: Method is too long and uses class instance variables (fields).

**Steps**:

1. Create new class to house method code
2. Create constructor with exact copy of method arguments (Preserve Signatures)
3. Add reference to original class as first argument if needed
4. Declare instance variables for each argument, assign in constructor
5. Create empty execution method
6. Copy method body to execution method, Lean on Compiler
7. Fix compiler errors (missing references to old class)
8. Change original method to create instance and delegate
9. If needed, Extract Interface for original class dependency

---

#### 13. Expose Static Method

**Solves**: Independent Method in Difficult Class

**When**: Testing a method that doesn't use instance fields in a class that's difficult to instantiate.

**Steps**:

1. Write test accessing method as public static
2. Extract body to static method (different name, Preserve Signatures)
3. Compile
4. Make related features static if needed

---

#### 14. Pull Up Feature

**Solves**: Difficult Unrelated Method

**When**: Testing a method that doesn't use problematic dependencies, but they're in the same class.

**Steps**:

1. Identify methods to pull up
2. Create abstract superclass
3. Copy methods to superclass, compile
4. Copy missing references (Preserve Signatures)
5. When both compile, create test subclass

---

#### 15. Push Down Dependency

**Solves**: Difficult Unrelated Method

**When**: Testing a class with pervasive dependencies that only some methods use.

**Steps**:

1. Attempt to build class in test harness
2. Identify problematic dependencies
3. Create subclass named for dependency environment
4. Move problematic instance variables and methods to subclass
5. Make methods protected abstract in original, make original abstract
6. Create testing subclass
7. Verify you can instantiate testing subclass

---

#### 16. Encapsulate Global Reference

**Solves**: Method Using Globals as Parameters

**When**: Need to decouple dependencies on global references.

**Steps**:

1. Identify globals to encapsulate
2. Create class to reference them from
3. Copy globals into class, handle initialization
4. Comment out original declarations
5. Declare global instance of new class
6. Lean on Compiler for unresolved references
7. Precede each with global instance name
8. Use other techniques to inject fakes

---

#### 17. Replace Global Reference with Getter

**Solves**: Local Variable Hardcoded to Global

**When**: Testing code with dependencies on global or singleton.

**Steps**:

1. Identify global reference to replace
2. Write getter for global reference (protected/virtual)
3. Replace references with getter calls
4. Create testing subclass, override getter

---

#### 18. Introduce Instance Delegator

**Solves**: Difficult Static Method

**When**: Testing a class that depends on a problematic static method.

**Steps**:

1. Identify problematic static method
2. Create instance method that delegates to static method (Preserve Signatures)
3. Use Parameterize Method or other technique to supply instance where static was called

---

## Characterization Testing

### What is Characterization Testing?

Michael Feathers coined the term "characterization test":

> "A characterization test is a test that describes (characterizes) the **actual behavior** of some code."

**Critical Distinction**:

| Aspect               | Specification Tests (TDD) | Characterization Tests    |
| -------------------- | ------------------------- | ------------------------- |
| **Timing**           | Written BEFORE code       | Written AFTER code exists |
| **Purpose**          | Define expected behavior  | Document actual behavior  |
| **Assertion Source** | Requirements/specs        | Running the actual code   |
| **Goal**             | Drive implementation      | Enable safe refactoring   |

### Characterization Testing Process

```
1. Use a piece of code in a test harness
2. Write an assertion that you KNOW will fail
3. Run the test and let the failure tell you actual behavior
4. Change the test to expect the actual behavior
5. Repeat until all degrees of freedom are covered
6. Name the test according to business behavior being characterized
```

### What Characterization Tests Are NOT

❌ **NOT a test type** — You still write acceptance/unit/integration/contract tests
❌ **NOT limited to snapshots** — Golden Master is just one technique
❌ **NOT testing "correct" behavior** — Testing current behavior for regression safety

### Choose Test Level Before Technique

In Stage 3, first choose the **test taxonomy level** you need:

1. Acceptance
2. Unit
3. Integration
4. Contract

Only after that decision should you choose the characterization **technique**:

- **Golden Master** when broad or complex observed output is easier to approve than to assert by hand
- **Explicit unit characterization** when outputs and boundary side effects can be locked with direct assertions

Characterization is the mechanism for documenting actual behavior. Acceptance/unit/integration/contract remain the test categories.

### Characterization Techniques

#### Technique 1: I/O Characterization

Capture input → output mappings for existing code.

```typescript
// Step 1: Identify inputs and outputs
// Step 2: Create test matrix
// Step 3: Run code and capture ACTUAL outputs

describe('LegacyPriceCalculator', () => {
  it('characterizes discount calculation', () => {
    const calculator = new LegacyPriceCalculator();

    // Capture ACTUAL behavior (not expected)
    expect(calculator.calculate(100, 'VIP')).toBe(80); // Learned: 20% VIP discount
    expect(calculator.calculate(100, 'REGULAR')).toBe(95); // Learned: 5% regular discount
    expect(calculator.calculate(100, 'NEW')).toBe(100); // Learned: no discount for new
  });
});
```

#### Technique 2: Side Effect Characterization

Capture what side effects occur (DB writes, events, file changes).

```typescript
describe('LegacyOrderProcessor', () => {
  it('characterizes event publishing', () => {
    const capturedEvents: DomainEvent[] = [];
    const processor = new LegacyOrderProcessor({
      publish: (event) => capturedEvents.push(event),
    });

    processor.process(sampleOrder);

    // Document ACTUAL side effects
    expect(capturedEvents).toHaveLength(2);
    expect(capturedEvents[0].type).toBe('OrderReceived');
    expect(capturedEvents[1].type).toBe('InventoryReserved');
  });
});
```

#### Technique 3: Combination Testing

Systematically test input combinations to exercise all execution paths.

```typescript
// Use approval tests with combinations
describe('LegacyShippingCalculator', () => {
  const weights = [0.5, 1, 5, 10, 50];
  const zones = ['LOCAL', 'REGIONAL', 'NATIONAL', 'INTERNATIONAL'];
  const speeds = ['STANDARD', 'EXPRESS', 'OVERNIGHT'];

  // Combinatorial: 5 × 4 × 3 = 60 test cases
  weights.forEach((weight) => {
    zones.forEach((zone) => {
      speeds.forEach((speed) => {
        it(`calculates shipping for ${weight}kg to ${zone} via ${speed}`, () => {
          const result = calculator.calculate(weight, zone, speed);
          expect(result).toMatchSnapshot();
        });
      });
    });
  });
});
```

⚠️ **Warning**: Beware of combinatorial explosion! Start with important combinations, add more as needed.

---

## Golden Master and Approval Testing

### What is Golden Master Testing?

The Golden Master technique captures the entire output of a system as a snapshot for regression detection.

It is a characterization technique, not a separate test type. It can support acceptance, unit, integration, or contract tests when approved-output comparison is the safest way to lock current behavior.

### Feasibility Checklist

Before using Golden Master, verify:

1. ✅ System has clear inputs and outputs (console, file, network)?
2. ✅ System generates same output for same input? (If not, can you use Test Doubles?)
3. ✅ Can capture output without changing behavior?
4. ✅ Can inject input without changing behavior?

### Golden Master Process

**Phase 1: Generate Input/Output**

```
1. Create fake input for the system, persist to file
2. Create test that loads input, runs system, captures output
3. Measure test coverage
4. Repeat until coverage approaches 100%
```

**Phase 2: Assert**

```
1. Expand test to assert captured output matches expected (Golden Master)
2. Commit Golden Master files with tests
3. Mutate production code to verify test catches changes
4. Revert mutations, refine if needed
```

### Approval Testing Libraries

| Language   | Library                                  | Snapshot Location     |
| ---------- | ---------------------------------------- | --------------------- |
| TypeScript | `jest` (inline), `approvals`             | `__snapshots__/`      |
| Python     | `approvaltests`, `pytest-snapshot`       | `approved_files/`     |
| Java       | `ApprovalTests.Java`, `assertj-snapshot` | `src/test/resources/` |
| C#         | `ApprovalTests`, `Verify`                | `*.approved.txt`      |
| Go         | `approvals`, `cupaloy`                   | `testdata/`           |
| Rust       | `insta`, `expect-test`                   | `snapshots/`          |

### Capturing System Output

#### C#

```csharp
var streamwriter = new StreamWriter(
    new FileStream("/location/out.txt", FileMode.Create)
);
streamwriter.AutoFlush = true;
Console.SetOut(streamwriter);
```

#### Java

```java
System.setOut(new PrintStream(
    new BufferedOutputStream(
        new FileOutputStream("/location/out.txt")
    ), true
));
```

#### Python

```python
import sys
sys.stdout = open('/location/out.txt', 'w')
```

#### TypeScript/Node.js

```typescript
const fs = require('fs');
const output = fs.createWriteStream('/location/out.txt');
process.stdout.write = output.write.bind(output);
```

### Handling Non-Determinism

Non-deterministic elements break Golden Master tests. Solutions:

| Source          | Solution                                       |
| --------------- | ---------------------------------------------- |
| **Time/Dates**  | Inject clock interface, freeze time in tests   |
| **Random**      | Inject seed or deterministic generator         |
| **GUIDs/UUIDs** | Inject ID generator, use predictable IDs       |
| **Timestamps**  | Scrub before comparison or inject clock        |
| **Ordering**    | Sort before comparison if order doesn't matter |

```typescript
// Scrubbing non-deterministic values
function scrubForApproval(output: string): string {
  return output
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, '[TIMESTAMP]')
    .replace(/[a-f0-9-]{36}/g, '[UUID]')
    .replace(/\d{13}/g, '[EPOCH_MS]');
}
```

---

## Mock Discipline for Legacy Code

The same mock discipline from standard testing applies to legacy code, with additional considerations.

### Core Rules (Always Apply)

| Rule                              | Description                                                 |
| --------------------------------- | ----------------------------------------------------------- |
| **✅ Mock driven ports**          | Repositories, external APIs, message queues, infrastructure |
| **✅ Use fakes for repositories** | In-memory implementations for acceptance tests              |
| **❌ Never mock domain objects**  | Entities, value objects, aggregates, domain services        |
| **❌ Never verify queries**       | Only verify commands (state changes)                        |

### Legacy-Specific Considerations

#### Use Fakes for Seams When Possible

```typescript
// ✅ PREFERRED: Fake provides real behavior
class FakeEmailService implements EmailService {
  public sentEmails: Email[] = [];

  async send(email: Email): Promise<void> {
    this.sentEmails.push(email);
  }
}

// Test
const fakeEmail = new FakeEmailService();
const processor = new OrderProcessor(fakeEmail);
await processor.process(order);
expect(fakeEmail.sentEmails).toHaveLength(1);
```

#### Mocks for Infrastructure Verification

```typescript
// ✅ CORRECT: Mock for verifying infrastructure commands
test('order processing publishes event', () => {
  const mockEvents = mock(EventPublisher);
  const processor = new OrderProcessor(fakeRepo, mockEvents);

  processor.process(order);

  verify(mockEvents.publish).calledWith(instanceOf(OrderProcessedEvent));
});
```

#### Never Mock Domain Objects

```typescript
// ❌ WRONG: Mocking domain object
test('order calculates total') {
    const mockLineItem = mock(LineItem);
    mockLineItem.getPrice.returns(100);
    const order = new Order([mockLineItem]);
    expect(order.total).toBe(100);
}

// ✅ CORRECT: Use real domain objects (with Object Mother)
test('order calculates total') {
    const lineItem = LineItemMother.withPrice(100);
    const order = new Order([lineItem]);
    expect(order.total).toBe(100);
}
```

### Smell Indicator: Forces Domain Mocking

If a seam refactoring forces you to mock domain objects, **reconsider the refactoring**:

```typescript
// ❌ BAD SEAM: Forces mocking domain
class OrderProcessor {
  protected createOrder(): Order {
    // Seam
    return new Order();
  }
}

// Test forces domain mocking
class TestableOrderProcessor extends OrderProcessor {
  protected createOrder(): Order {
    return mock(Order); // ❌ Never mock domain!
  }
}

// ✅ BETTER SEAM: Inject infrastructure, keep domain real
class OrderProcessor {
  constructor(private repository: OrderRepository) {}
}

// Test uses fake repository
const processor = new OrderProcessor(new FakeOrderRepository());
```

---

## The 4-Stage Workflow

### Overview

```
Stage 1: Analysis       Stage 2: Seam Introduction  Stage 3: Testing        Stage 4: Refactor & Iterate
─────────────────────   ──────────────────────────  ─────────────────────   ───────────────────────────
• Detect smells         • Select seam techniques    • Write tests           • Refactor design
• Analyze gaps          • Apply seams               • Use characterization  • Re-analyze
• Prioritize            • Verify build              • Follow taxonomy       • Next priority
• Map smell→seam        • Commit per seam           • Mock discipline       • Repeat until target
```

### Stage 1: Smell Detection and Gap Analysis

**Goal**: Identify what makes code untestable and prioritize fixes.

**Priority Formula**:

```
Priority Score = (Business Criticality × Change Frequency) / Testability Effort
```

| Factor               | Scale | Description                                 |
| -------------------- | ----- | ------------------------------------------- |
| Business Criticality | 1-10  | How important is this code to the business? |
| Change Frequency     | 1-10  | How often does this code change?            |
| Testability Effort   | 1-10  | How much work to make it testable?          |

**Example**:

```
OrderProcessor.processOrder()
• Business Criticality: 10 (core revenue path)
• Change Frequency: 8 (changes weekly)
• Testability Effort: 4 (needs 2 seams)
• Priority Score: (10 × 8) / 4 = 20.0 ← HIGH PRIORITY
```

### Stage 2: Seam Introduction

**Goal**: Apply minimal, behavior-preserving changes to enable testing.

**Important**: This is NOT refactoring to improve design. Seams make code testable, often making it temporarily uglier. Design improvements come later (Stage 4) after tests are in place.

**Process**:

1. Show refactoring plan (before/after code)
2. Get user approval
3. Apply seam using IDE refactoring tools when possible
4. Verify build passes
5. Run existing tests (if any)
6. Commit atomically per seam

**Build Verification**:

| Language   | Build Command               | Test Command    |
| ---------- | --------------------------- | --------------- |
| TypeScript | `npm run build` or `tsc`    | `npm test`      |
| Python     | `python -m py_compile *.py` | `pytest`        |
| Java       | `mvn compile`               | `mvn test`      |
| C#         | `dotnet build`              | `dotnet test`   |
| Go         | `go build ./...`            | `go test ./...` |
| Rust       | `cargo build`               | `cargo test`    |

### Stage 3: Test Generation

**Goal**: Write tests using characterization techniques and standard test taxonomy.

**Test Priority** (Pedro's Algorithm for legacy):

1. **Acceptance Tests** — Highest-level safety net
2. **Unit Tests** — Domain logic protection
3. **Integration Tests** — Adapter verification
4. **Contract Tests** — API consistency

**Process**:

1. Detect existing test framework and patterns
2. Choose taxonomy level first: Acceptance -> Unit -> Integration -> Contract
3. Choose characterization technique for that level:
   - Golden Master when broad or complex observed output is better approved than hand-asserted
   - Explicit unit characterization when outputs and boundary side effects can be asserted directly
4. Use the fail-first characterization loop to discover actual behavior before final assertions
5. Handle non-determinism and verify Golden Master feasibility when applicable
6. Generate tests following project conventions
7. Verify tests pass
8. Measure coverage delta

### Stage 4: Refactor & Iterate

**Goal**: Improve design now that tests protect you, then repeat for next highest-priority gap.

**Process**:

1. **Refactor** — Now that tests are in place, improve the design
   - Remove duplication
   - Apply patterns
   - Improve naming
   - Extract responsibilities
   - Tests give you safety to refactor confidently
2. **Re-analyze** — Identify next priority
3. **Decide** — Continue or stop based on coverage target

**Continue When**:

- Coverage < target threshold
- High-priority gaps remain (score > 10)
- User requests next iteration

**Stop When**:

- Coverage target reached
- Only low-priority gaps remain (score < 5)
- Diminishing returns (effort > 3× value)

---

## Fallback Strategies

When standard seam refactoring is too risky, use these alternative approaches.

### Sprout Method

Don't modify legacy method. Create new testable method alongside.

```java
// Legacy method - don't touch
public void processOrder(Order order) {
    // Complex, untestable code
    calculateTotal(order);  // Hidden in mess
}

// Sprout - new testable method
public Money calculateOrderTotal(Order order) {
    // Extracted, testable logic
    return order.getLineItems().stream()
        .map(LineItem::getPrice)
        .reduce(Money.ZERO, Money::add);
}
```

### Sprout Class

Don't modify legacy class. Create new testable class that legacy delegates to.

```java
// New testable class
public class OrderTotalCalculator {
    public Money calculate(List<LineItem> items) {
        // Testable logic
    }
}

// Legacy class delegates
public class LegacyOrderProcessor {
    private OrderTotalCalculator calculator = new OrderTotalCalculator();

    public void processOrder(Order order) {
        Money total = calculator.calculate(order.getLineItems());
        // Continue with legacy code...
    }
}
```

### Wrap Method

Rename legacy method, create new method with original name that wraps it.

```java
// Step 1: Rename legacy
private void processOrder_legacy(Order order) {
    // Original untestable code
}

// Step 2: Wrap with testable additions
public void processOrder(Order order) {
    validate(order);  // New testable behavior
    processOrder_legacy(order);
    publishEvent(order);  // New testable behavior
}
```

### Integration Test at Higher Level

When unit-level seams are too risky, write coarser-grained tests.

```java
// Can't unit test PaymentProcessor, but can integration test the flow
@Test
void orderFlowCompletesSuccessfully() {
    // Use real (or fake) infrastructure at higher level
    var orderService = new OrderService(
        new FakeInventory(),
        new FakePaymentGateway(),
        new FakeNotifications()
    );

    var result = orderService.placeOrder(sampleOrder);

    assertThat(result.isSuccess()).isTrue();
}
```

### Strangler Fig Pattern

For code that is truly untestable without rewrite, use gradual replacement:

```
1. Build new tested implementation alongside legacy
2. Route some traffic/calls to new implementation
3. Gradually increase new implementation usage
4. Monitor for parity
5. Remove legacy when fully replaced
```

```
┌─────────────────────────────────────────────────────────────┐
│                    STRANGLER FIG PATTERN                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Phase 1:  ████████████████░░░░  Legacy: 100% | New: 0%     │
│  Phase 2:  ████████████░░░░░░░░  Legacy: 80%  | New: 20%    │
│  Phase 3:  ████████░░░░░░░░░░░░  Legacy: 50%  | New: 50%    │
│  Phase 4:  ████░░░░░░░░░░░░░░░░  Legacy: 20%  | New: 80%    │
│  Phase 5:  ░░░░░░░░░░░░░░░░░░░░  Legacy: 0%   | New: 100%   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Language-Specific Patterns

### TypeScript

**Seam via Higher-Order Functions (Peel and Slice)**:

```typescript
// Before
class Game {
  play(): void {
    const diceResult = Math.floor(Math.random() * 6) + 1;
    // ...
  }
}

// After - HOF seam
class Game {
  play(rollDice: () => number = () => Math.floor(Math.random() * 6) + 1): void {
    const diceResult = rollDice();
    // ...
  }
}

// Test
game.play(() => 6); // Deterministic roll
```

**Approval Testing with Jest**:

```typescript
import { toMatchSnapshot } from 'jest';

test('characterizes legacy report', () => {
  const report = legacyReporter.generate(sampleData);
  expect(report).toMatchSnapshot();
});
```

---

### Python

**Seam via Monkey Patching** (test-only, use sparingly):

```python
# Production code
class PaymentProcessor:
    def process(self, payment):
        result = external_api.charge(payment)  # Hard dependency
        return result

# Test with monkeypatch
def test_payment_processing(monkeypatch):
    def fake_charge(payment):
        return ChargeResult(success=True)

    monkeypatch.setattr('module.external_api.charge', fake_charge)

    processor = PaymentProcessor()
    result = processor.process(sample_payment)

    assert result.success
```

**Approval Testing**:

```python
from approvaltests import verify

def test_characterizes_legacy_output():
    result = legacy_processor.process(sample_input)
    verify(result)  # Creates/compares .approved.txt
```

---

### Java

**Seam via Subclass and Override**:

```java
// Production
public class OrderService {
    public void process(Order order) {
        Date now = getCurrentTime();
        // ...
    }

    protected Date getCurrentTime() {
        return new Date();
    }
}

// Test
class TestableOrderService extends OrderService {
    private final Date fixedTime;

    TestableOrderService(Date fixedTime) {
        this.fixedTime = fixedTime;
    }

    @Override
    protected Date getCurrentTime() {
        return fixedTime;
    }
}
```

**Approval Testing**:

```java
import org.approvaltests.Approvals;

@Test
void characterizesLegacyReport() {
    String report = legacyReporter.generate(sampleData);
    Approvals.verify(report);
}
```

---

### C\#

**Seam via Virtual Method**:

```csharp
public class Game
{
    public void Play()
    {
        var diceResult = Roll();
        // ...
    }

    protected virtual int Roll()
    {
        return new Random().Next(1, 6);
    }
}

// Test
public class TestableGame : Game
{
    private readonly int _roll;
    public TestableGame(int roll) => _roll = roll;
    protected override int Roll() => _roll;
}
```

**Approval Testing with Verify**:

```csharp
using VerifyXunit;

[Fact]
public Task CharacterizesLegacyOutput()
{
    var result = legacyProcessor.Process(sampleInput);
    return Verify(result);
}
```

---

### Go

**Seam via Interface**:

```go
// Define interface for dependency
type TimeProvider interface {
    Now() time.Time
}

// Production implementation
type RealTimeProvider struct{}
func (r RealTimeProvider) Now() time.Time { return time.Now() }

// Test implementation
type FakeTimeProvider struct {
    FixedTime time.Time
}
func (f FakeTimeProvider) Now() time.Time { return f.FixedTime }

// Usage
type OrderService struct {
    timeProvider TimeProvider
}
```

**Approval Testing**:

```go
import "github.com/approvals/go-approval-tests"

func TestCharacterizesLegacy(t *testing.T) {
    result := legacyProcessor.Process(sampleInput)
    approvals.VerifyString(t, result)
}
```

---

### Rust

**Seam via Trait**:

```rust
trait TimeProvider {
    fn now(&self) -> DateTime<Utc>;
}

struct RealTimeProvider;
impl TimeProvider for RealTimeProvider {
    fn now(&self) -> DateTime<Utc> { Utc::now() }
}

struct FakeTimeProvider(DateTime<Utc>);
impl TimeProvider for FakeTimeProvider {
    fn now(&self) -> DateTime<Utc> { self.0 }
}

struct OrderService<T: TimeProvider> {
    time_provider: T,
}
```

**Approval Testing with insta**:

```rust
use insta::assert_snapshot;

#[test]
fn characterizes_legacy_output() {
    let result = legacy_processor.process(&sample_input);
    assert_snapshot!(result);
}
```

---

## Quality Indicators

### Well-Tested Legacy Code Demonstrates

| Indicator                                   | Description                                   |
| ------------------------------------------- | --------------------------------------------- |
| ✅ **Seams Enable Fakes, Not Domain Mocks** | Seams allow infrastructure substitution only  |
| ✅ **Characterization Before Refactoring**  | Tests capture current behavior before changes |
| ✅ **Behavior-Preserving Seams**            | Refactorings don't change what code does      |
| ✅ **Incremental Coverage Growth**          | Each iteration adds measurable coverage       |
| ✅ **Test Taxonomy Followed**               | Acceptance → Unit → Integration order         |
| ✅ **Mock Discipline Maintained**           | Never mock domain objects                     |
| ✅ **Atomic Commits per Seam**              | Each seam is independently rollback-able      |
| ✅ **Build Verified After Each Seam**       | No broken builds during process               |

### Anti-Patterns to Avoid

| Anti-Pattern                  | Problem                       | Solution                                 |
| ----------------------------- | ----------------------------- | ---------------------------------------- |
| ❌ Big Bang Refactoring       | High risk, no safety net      | Incremental seams with tests             |
| ❌ Mocking Domain Objects     | Brittle, tests implementation | Use real domain objects + Object Mothers |
| ❌ Skipping Characterization  | Don't know actual behavior    | Always characterize before refactoring   |
| ❌ Working in Isolation       | High cognitive load, risky    | Pair/mob programming                     |
| ❌ No Build Verification      | Silent breakage               | Verify build after every seam            |
| ❌ Testing Expected vs Actual | Assumptions about behavior    | Let failures reveal actual behavior      |

---

## Mutation Testing for Legacy Code

When retrofitting tests to a codebase, code coverage metrics only measure executed instructions—not test correctness. Mutation testing solves this.

### How It Works

1. Tool injects faults ("mutations") into production code
2. Runs test suite against mutated code
3. If tests **fail** → mutation is **killed** (good!)
4. If tests **pass** → mutation **survived** (test gap!)

### Mutation Testing Tools

| Language              | Tool          |
| --------------------- | ------------- |
| TypeScript/JavaScript | Stryker       |
| Python                | MutPy, mutmut |
| Java                  | PIT (Pitest)  |
| C#                    | Stryker.NET   |
| Go                    | go-mutesting  |
| Rust                  | cargo-mutants |

### When to Use

- After characterization tests are in place
- To validate test suite quality
- To find blind spots in coverage
- Before major refactoring

---

## Great Habits Checklist

### When Adding Tests to Legacy Code

- [ ] Identify legacy code smells before writing tests
- [ ] Apply minimal seams to enable testing
- [ ] Use IDE-driven refactorings when possible
- [ ] Verify build after every seam
- [ ] Commit atomically per seam
- [ ] Write characterization tests before refactoring
- [ ] Let test failures reveal actual behavior
- [ ] Use Golden Master for complex outputs
- [ ] Follow mock discipline (infrastructure only)
- [ ] Follow test priority (Acceptance → Unit → Integration)
- [ ] Work collaboratively, not in isolation
- [ ] Document technical debt when tests aren't feasible

### When Characterizing Behavior

- [ ] Write assertion you know will fail
- [ ] Run test, observe actual behavior
- [ ] Update assertion to match reality
- [ ] Name test for business behavior
- [ ] Cover all degrees of freedom
- [ ] Handle non-determinism (time, random, IDs)

### When Refactoring After Tests

- [ ] Stay in the green while refactoring
- [ ] Use the IDE to refactor quickly and safely
- [ ] Apply Rule of Three for duplication
- [ ] Look out for code smells
- [ ] Refactor for readability first

---

## Resources

### Books

- _Working Effectively with Legacy Code_ — Michael C. Feathers
- _Refactoring: Improving the Design of Existing Code_ — Martin Fowler

### Web

- [Approval Tests](http://approvaltests.com/) — Llewellyn Falco
- [Peel & Slice Technique](https://www.youtube.com/playlist?list=PLb4ON7iRsxZNNqZuA2dlQOW3MOQwQ6AjM) — Llewellyn Falco
- [Gilded Rose Refactoring Kata](https://github.com/emilybache/GildedRose-Refactoring-Kata) — Emily Bache
- [Strangler Fig Application](https://martinfowler.com/bliki/StranglerFigApplication.html) — Martin Fowler

### Katas for Practice

1. **Gilded Rose** — Characterization testing and refactoring
2. **Trivia Game** — Legacy code with global state
3. **Trip Service** — Dependency breaking techniques

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────────┐
│                 LEGACY CODE TESTING QUICK REF                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  WORKFLOW:  Smell → Seam → Test → Refactor → Repeat             │
│                                                                 │
│  4-STAGE PROCESS:                                               │
│    1. Analysis (Detect smells, prioritize)                      │
│    2. Seam Introduction (Behavior-preserving changes ONLY)      │
│    3. Test Generation (Characterization tests)                  │
│    4. Refactor & Iterate (Improve design, next priority)        │
│                                                                 │
│  SMELL CATEGORIES (11 total):                                   │
│    • Difficult Class (2)      • Globals (3)                     │
│    • Hardcoded Values (2)     • Static (1)                      │
│    • Types (2)                • Cross-Methods (1)               │
│                                                                 │
│  TOP REFACTORINGS:                                              │
│    • Subclass and Override Method (the "mother of all")         │
│    • Parameterize Constructor                                   │
│    • Extract Interface                                          │
│    • Introduce Static Setter                                    │
│                                                                 │
│  CHARACTERIZATION TECHNIQUES:                                   │
│    • Golden Master / Approval Testing                           │
│    • I/O Characterization                                       │
│    • Side Effect Characterization                               │
│    • Combination Testing                                        │
│                                                                 │
│  MOCK DISCIPLINE:                                               │
│    ✅ Mock: Infrastructure (repos, APIs, queues)                │
│    ✅ Use: Fakes for repositories                               │
│    ❌ Never: Mock domain objects                                │
│    ❌ Never: Verify queries                                     │
│                                                                 │
│  TEST PRIORITY (Pedro's Algorithm):                             │
│    Acceptance → Unit → Integration → Contract                   │
│                                                                 │
│  FALLBACKS:                                                     │
│    • Sprout Method/Class                                        │
│    • Wrap Method                                                │
│    • Higher-level integration test                              │
│    • Strangler Fig for replacement                              │
│                                                                 │
│  GOLDEN RULE:                                                   │
│    Seams make code WORSE before tests make it BETTER.           │
│    Stage 2: Introduce seams (behavior-preserving only)          │
│    Stage 3: Write tests (now possible with seams)               │
│    Stage 4: Refactor design (now safe with test protection)     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```
