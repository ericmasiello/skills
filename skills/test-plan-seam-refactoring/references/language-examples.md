# Language Examples

Use this file for canonical code examples when a seam plan needs more than the inline output template.

## Subclass and Override Method

```typescript
class Game {
  play(): void {
    const diceResult = this.roll();
    void diceResult;
  }

  protected roll(): number {
    return Math.floor(Math.random() * 6) + 1;
  }
}

class TestableGame extends Game {
  constructor(private readonly fixedRoll: number) {
    super();
  }

  protected roll(): number {
    return this.fixedRoll;
  }
}
```

## Extract Interface

```typescript
interface Database {
  save(entity: unknown): Promise<void>;
}

class PostgresDatabase implements Database {
  async save(_entity: unknown): Promise<void> {}
}

class FakeDatabase implements Database {
  async save(_entity: unknown): Promise<void> {}
}

class OrderProcessor {
  constructor(private readonly database: Database) {}
}
```

## Parameterize Constructor

```typescript
class OrderProcessor {
  constructor(private readonly db: Database = new PostgresDatabase()) {}
}

const processor = new OrderProcessor(new FakeDatabase());
```

## Parameterize Method / Peel and Slice

```typescript
class AuditLogger {
  log(message: string, timestamp: Date = new Date()): string {
    return `[${timestamp.toISOString()}] ${message}`;
  }
}

class Game {
  play(rollDice: () => number = () => Math.floor(Math.random() * 6) + 1): number {
    return rollDice();
  }
}
```

## Extract and Override Getter

```csharp
public class OrderService
{
    private ILogger? _logger;

    protected virtual ILogger Logger
    {
        get
        {
            _logger ??= new FileLogger();
            return _logger;
        }
    }
}
```

## Introduce Static Setter

```csharp
public class ConfigManager
{
  private static ConfigManager? _instance;

  public static ConfigManager Instance()
  {
    _instance ??= new ConfigManager();
    return _instance;
  }

  public static void SetInstance(ConfigManager replacement)
  {
    _instance = replacement;
  }

  public static void ResetInstance()
  {
    _instance = null;
  }
}
```

## Break Out Method Object

```typescript
class PointDrawer {
  constructor(
    private readonly points: Point[],
    private readonly colors: Color[],
    private readonly bounds: Bounds,
  ) {}

  execute(): void {
    for (let index = 0; index < this.points.length; index += 1) {
      const point = this.points[index];
      if (point.x >= this.bounds.minX && point.x <= this.bounds.maxX) {
        void this.colors[index];
      }
    }
  }
}
```

## Expose Static Method

```go
func TranslatePoints(points []Point, xOffset int, yOffset int) []Point {
  translated := make([]Point, 0, len(points))
  for _, point := range points {
    translated = append(translated, Point{
      X: point.X + xOffset,
      Y: point.Y + yOffset,
    })
  }
  return translated
}
```

## Introduce Instance Delegator

```typescript
class PaymentGatewayDelegator {
  accept(amount: number): void {
    PaymentGateway.accept(amount);
  }
}

class PaymentProcessor {
  constructor(private readonly gateway: PaymentGatewayDelegator = new PaymentGatewayDelegator()) {}

  process(amount: number): void {
    this.gateway.accept(amount);
  }
}
```
