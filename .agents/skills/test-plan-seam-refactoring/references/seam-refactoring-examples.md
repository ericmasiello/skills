# Worked Seam Refactoring Examples

Use these examples when the main skill has already selected a pattern and you need a concrete code shape to model.

## Example 1: Parameterize Constructor to Break Database Dependency

**Scenario**: `UserService` hardcodes a database connection in the constructor, blocking unit tests.

**Blocker**: Hardcoded Instance Variable in Constructor

**Seam Pattern**: Parameterize Constructor (#3)

**Before (UNTESTABLE)**:

```typescript
class UserService {
  private db: Database;

  constructor() {
    this.db = new Database('production.db');
  }

  async getUser(id: string): Promise<User> {
    return this.db.query('SELECT * FROM users WHERE id = ?', [id]);
  }
}
```

**After (TESTABLE with Seam)**:

```typescript
class UserService {
  private db: Database;

  constructor(db?: Database) {
    this.db = db ?? new Database('production.db');
  }

  async getUser(id: string): Promise<User> {
    return this.db.query('SELECT * FROM users WHERE id = ?', [id]);
  }
}

describe('UserService', () => {
  it('should retrieve user by id', async () => {
    const fakeDb = new FakeDatabase();
    fakeDb.addUser({ id: '123', name: 'Alice' });

    const service = new UserService(fakeDb);

    const user = await service.getUser('123');
    expect(user.name).toBe('Alice');
  });
});
```

**Why it works**:

- production behavior stays the same through the default constructor branch
- the seam is minimal and explicit
- the fake lives at the infrastructure boundary, not in domain logic

## Example 2: Extract and Override Getter for Clock Dependency

**Scenario**: `InvoiceGenerator` uses `datetime.now()` directly, making tests time-dependent.

**Blocker**: Hardcoded Variable in Method

**Seam Pattern**: Extract and Override Getter (#7)

**Before (NON-DETERMINISTIC)**:

```python
class InvoiceGenerator:
    def generate(self, order):
        current_date = datetime.now()
        due_date = current_date + timedelta(days=30)

        return Invoice(
            order=order,
            issued_at=current_date,
            due_at=due_date,
        )
```

**After (TESTABLE with Seam)**:

```python
class InvoiceGenerator:
    def generate(self, order):
        current_date = self.get_current_date()
        due_date = current_date + timedelta(days=30)

        return Invoice(
            order=order,
            issued_at=current_date,
            due_at=due_date,
        )

    def get_current_date(self):
        return datetime.now()


class TestableInvoiceGenerator(InvoiceGenerator):
    def __init__(self, fixed_date):
        self.fixed_date = fixed_date

    def get_current_date(self):
        return self.fixed_date
```

**Why it works**:

- production still uses the real clock
- tests gain deterministic control with a tiny override seam
- the seam stays local to the dependency source

## Example 3: Extract Interface for External Service

**Scenario**: `OrderProcessor` depends on a concrete `EmailClient` that sends real emails.

**Blocker**: Difficult Parameter

**Seam Pattern**: Extract Interface (#2)

**Before (SIDE EFFECTS)**:

```csharp
public class OrderProcessor
{
    private readonly EmailClient _emailClient;

    public OrderProcessor(EmailClient emailClient)
    {
        _emailClient = emailClient;
    }

    public void ProcessOrder(Order order)
    {
        _emailClient.SendEmail(
            order.CustomerEmail,
            "Order Confirmed",
            GenerateEmailBody(order)
        );
    }
}
```

**After (TESTABLE with Seam)**:

```csharp
public interface IEmailSender
{
    void SendEmail(string to, string subject, string body);
}

public class EmailClient : IEmailSender
{
    public void SendEmail(string to, string subject, string body)
    {
        // Real SMTP sending
    }
}

public class OrderProcessor
{
    private readonly IEmailSender _emailSender;

    public OrderProcessor(IEmailSender emailSender)
    {
        _emailSender = emailSender;
    }

    public void ProcessOrder(Order order)
    {
        _emailSender.SendEmail(
            order.CustomerEmail,
            "Order Confirmed",
            GenerateEmailBody(order)
        );
    }
}

public sealed class FakeEmailSender : IEmailSender
{
    public List<(string To, string Subject, string Body)> Sent { get; } = new();

    public void SendEmail(string to, string subject, string body)
    {
        Sent.Add((to, subject, body));
    }
}
```

**Why it works**:

- the dependency boundary becomes substitutable without changing domain behavior
- the fake captures side effects safely
- the production path still uses the concrete client through the interface
