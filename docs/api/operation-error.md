# OperationError API

`OperationError` is an error class for returning structured HTTP error responses from route handlers and middlewares.

## Import

```ts
import { OperationError } from "linebridge"

// Also available as a global:
throw new OperationError(404, "User not found")
```

## Constructor

```ts
new OperationError(code: number = 500, message: string)
```

## Properties

### `code: number`
HTTP status code (default: 500).

### `message: string`
Error message (inherited from `Error`).

## Usage

### In Route Handlers

```ts
fn: async (req, res) => {
  const user = await findUser(req.params.id)
  if (!user) {
    throw new OperationError(404, "User not found")
  }
  return { user }
}
```

When thrown, the Handler automatically catches it and responds:

```json
{ "error": "User not found" }
```

With the status code set to `404`.

### In Middlewares

```ts
middlewares = {
  requireAuth: async (req, res, next) => {
    if (!req.headers["authorization"]) {
      throw new OperationError(401, "Authentication required")
    }
    next()
  },
}
```

### In WebSocket Handlers

```ts
wsEvents = {
  "admin:action": async (client, data) => {
    if (!client.authenticated) {
      throw new OperationError(401, "Not authenticated")
    }
    // ...
  },
}
```

Note: In WebSocket handlers, `OperationError` is silently swallowed (doesn't crash the connection).

## Error Handling Flow

1. Handler or middleware throws `OperationError`
2. The `Handler.execute()` method catches it
3. For HTTP: `res.status(error.code).json({ error: error.message })`
4. For WebSocket: silently ignored (no response sent)
5. Non-`OperationError` errors: logged and return `500`

## Type Export

```ts
import type { OperationErrorType } from "linebridge"
// typeof OperationError
```
