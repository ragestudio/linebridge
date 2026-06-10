# NanoID

Generates a URL-safe, crypto-random unique ID string.

## Import

```ts
import nanoid from "linebridge/utils/nanoid"
```

## Signature

```ts
function nanoid(t?: number): string
```

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `t` | `number` | `21` | Length of the generated ID in characters |

## Returns

`string` - a random ID using URL-safe Base64 characters (`A-Za-z0-9_-`).

## Implementation

Uses `node:crypto`'s `webcrypto.getRandomValues()` for cryptographically secure randomness:

```ts
crypto
  .getRandomValues(new Uint8Array(t))
  .reduce((t, e) =>
    (t +=
      (e &= 63) < 36
        ? e.toString(36)
        : e < 62
          ? (e - 26).toString(36).toUpperCase()
          : e > 62
            ? "-"
            : "_"),
    "",
  )
```

## Usage

```ts
import nanoid from "linebridge/utils/nanoid"

const id = nanoid()       // "k7YxL2mPqR9vW3nB5jH8"
const shortId = nanoid(8) // "aB3xK9mQ"
```

## Internal Use

Used by the RTEngine upgrade handler to generate unique WebSocket client IDs:

```ts
const context = {
  id: nanoid(),  // "Xm4Kp2R..."
  token: req.query.token,
  user: null,
}
```
