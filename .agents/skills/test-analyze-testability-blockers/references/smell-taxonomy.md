# Legacy Smell Taxonomy Reference

Preserved detailed smell catalog extracted from the earlier inline skill.
Use this file when the review needs canonical examples, smell rationale, or the original longer descriptions.

## Category 1: Difficult Class

### 1.1 Long Method in Difficult Class

- Detection: target method is long or complex and the class is difficult to instantiate.
- Why untestable: the class cannot be created safely in test code.
- Severity: High.
- Recommended refactoring: Break Out Method Object.

Example:

```csharp
// UNTESTABLE: target method is long, but the class cannot be created safely
public class DrawingCanvas
{
    public DrawingCanvas(/* ...lots of dependencies... */)
    {
        throw new InvalidOperationException("This class is too difficult to create");
    }

    public void DrawPoints(IReadOnlyList<Point> points, Color[] colors)
    {
        for (var index = 0; index < points.Count; index++)
        {
            var point = points[index];
            if (point.X >= MinX && point.X <= MaxX && point.Y >= MinY && point.Y <= MaxY)
            {
                DrawPoint(point.X, point.Y, colors[index]);
            }
        }
    }
}
```

### 1.2 Independent Method in Difficult Class

- Detection: target method does not use instance state, but the class is difficult to instantiate.
- Why untestable: the method is trapped inside an uncreatable class.
- Severity: Medium.
- Recommended refactoring: Expose Static Method.

Example:

```go
// UNTESTABLE: method is independent, but the class is still hard to create
type DrawingCanvas struct{}

func NewDrawingCanvas() *DrawingCanvas {
    panic("this type is too difficult to create")
}

func (canvas *DrawingCanvas) TranslatePoints(points []Point, xOffset int, yOffset int) []Point {
    translated := make([]Point, 0, len(points))
    for _, point := range points {
        translated = append(translated, Point{X: point.X + xOffset, Y: point.Y + yOffset})
    }
    return translated
}
```

## Category 2: Hardcoded Values

### 2.1 Hardcoded Instance Variable in Constructor

- Detection: constructor initializes state to a fixed value that tests cannot override.
- Why untestable: required scenarios cannot be reached from tests.
- Severity: High.
- Recommended refactorings: Supersede Instance Variable, Parameterize Constructor, Extract and Override Factory Method.

Example:

```csharp
// UNTESTABLE: constructor hardcodes state and blocks test scenarios
public class Pager
{
    private PagerState _state;

    public Pager()
    {
        _state = PagerState.Busy;
        Reset();
    }

    protected void FormConnection()
    {
        if (_state != PagerState.Ready)
        {
            throw new InvalidOperationException("I am not ready");
        }
    }
}
```

### 2.2 Hardcoded Variable in Method

- Detection: method creates an internal object that tests need to control or observe.
- Why untestable: the dependency cannot be substituted or inspected.
- Severity: High.
- Recommended refactorings: Subclass and Override Method, Parameterize Method, Extract and Override Call.

Example:

```go
// UNTESTABLE: result is created internally and cannot be controlled in tests
func (payment *Payment) Process() {
    attempts := 0
    payment.result = NewPaymentResult()
    for attempts < maxAttempts {
        if err := payment.provider.Accept(payment); err != nil {
            payment.result.AddFailure(err)
        }
        attempts++
    }
}
```

## Category 3: Types

### 3.1 Difficult Parameter

- Detection: method depends on an external or difficult-to-construct parameter type.
- Why untestable: the parameter type cannot be built in tests.
- Severity: Medium.
- Recommended refactorings: Adapt Parameter, Extract Interface, Extract Implementer.

Example:

```csharp
// UNTESTABLE: external request type cannot be created easily in tests
public class SalesReportingService
{
    public string CreateConsoleReport(RemoteSalesApiRequest request)
    {
        return $"Q1: {request.Q1Total} | Q2: {request.Q2Total} | Q3: {request.Q3Total} | Q4: {request.Q4Total}";
    }
}
```

### 3.2 Difficult Parameter with Primitive Access

- Detection: method needs only primitive fields from a difficult parameter.
- Why untestable: tests must supply the whole hard-to-create external object.
- Severity: Medium.
- Recommended refactoring: Primitivize Parameter.

Example:

```go
// UNTESTABLE: response is external, but the logic only needs primitive values from it
func (service *SalesReportingService) CreateMultiYearConsoleReport(response RemoteMultiYearSalesAPIResponse) string {
    // Only accesses primitive properties from response
    return "..."
}
```

## Category 4: Globals

### 4.1 Local Variable Hardcoded to Singleton

- Detection: method uses `.instance()` or `getInstance()` style singleton access.
- Why untestable: production-only singleton behavior cannot be substituted.
- Severity: Critical.
- Recommended refactoring: Introduce Static Setter.

Example:

```csharp
// UNTESTABLE: singleton access only works in production
public class MessageRouter
{
    public void Route(string message)
    {
        var dispatcher = ExternalRouter.Instance().GetDispatcher();
        if (dispatcher != null)
        {
            dispatcher.SendMessage(message);
        }
    }
}
```

### 4.2 Local Variable Hardcoded to Global

- Detection: method reads a global or static holder directly.
- Why untestable: tests cannot isolate the dependency or control the data.
- Severity: High.
- Recommended refactoring: Replace Global Reference with Getter.

Example:

```go
// UNTESTABLE: direct global access prevents isolation
func (sale *RegisterSale) AddItem(code Barcode) {
    item := Inventory().ItemForBarcode(code)
    Items = append(Items, item)
}
```

### 4.3 Method Using Globals as Parameters

- Detection: global references are passed into internal methods.
- Why untestable: internal behavior still depends on uncontrolled global state.
- Severity: High.
- Recommended refactoring: Encapsulate Global Reference.

Example:

```csharp
// UNTESTABLE: globals are passed into internal methods
public class DrawingCanvas
{
    public void SuspendFrame()
    {
        FrameCopy(Globals.SuspendedFrame, Globals.ActiveFrame);
        Clear(Globals.SuspendedFrame);
    }
}
```

## Category 5: Static

### 5.1 Difficult Static Method

- Detection: static method touches production-only or external side effects.
- Why untestable: tests cannot override or isolate the static dependency.
- Severity: Medium.
- Recommended refactoring: Introduce Instance Delegator.

Example:

```go
// UNTESTABLE: static helper touches production-only behavior
func Withdraw(userID int, amount decimal.Decimal) {
    UpdateAccountBalance(userID, amount)
}

func UpdateAccountBalance(userID int, amount decimal.Decimal) {
    panic("this method will only work in production")
}
```

## Category 6: Cross-Methods

### 6.1 Difficult Unrelated Method

- Detection: an unrelated difficult method blocks testing of the target method in the same class.
- Why untestable: a sibling dependency path makes the class unsafe or impossible to exercise.
- Severity: Low.
- Recommended refactorings: Pull Up Feature, Push Down Dependency.

Example:

```csharp
// UNTESTABLE: sibling production-only method prevents safe instantiation
public class Scheduler
{
    private readonly List<ScheduleItem> _items = new();

    private void Validate(ScheduleItem item)
    {
        throw new InvalidOperationException("This can only run in production");
    }

    public int GetDeadTime()
    {
        var result = 0;
        foreach (var item in _items)
        {
            // calculation logic we want to test
        }
        return result;
    }
}
```

## Canonical Review Reminder

Only report a smell when it blocks testing.
Do not use this taxonomy as a generic design-smell checklist.
