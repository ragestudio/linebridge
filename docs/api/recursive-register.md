# Recursive Register

Recursively walks a directory tree, matching files against a predicate and executing a callback for each match. Used for file-based route and WebSocket event registration.

## Import

```ts
import RecursiveRegister from "linebridge/utils/recursiveRegister"
```

## Signature

```ts
async function RecursiveRegister(params: RecursiveRegisterParams): Promise<void>

interface RecursiveRegisterParams {
  start: string
  match: (filePath: string) => Promise<boolean> | boolean
  onMatch: (result: {
    absolutePath: string
    relativePath: string
  }) => Promise<any> | any
}
```

## Parameters

| Property | Type | Description |
|----------|------|-------------|
| `start` | `string` | Root directory to scan |
| `match` | `(filePath: string) => boolean \| Promise<boolean>` | Predicate to filter files |
| `onMatch` | `(result) => any \| Promise<any>` | Callback for each matched file |

### `onMatch` Result

| Property | Type | Description |
|----------|------|-------------|
| `absolutePath` | `string` | Full filesystem path to the file |
| `relativePath` | `string` | Path relative to `start` directory |

## Behavior

- Uses `fs.promises.readdir()` and `fs.promises.stat()` for async directory traversal
- Recursively enters subdirectories
- Calls `match()` for each file; if it returns `true`, calls `onMatch()`
- The `relativePath` is computed by splitting on `/` and taking everything after the `start` directory name

## Usage

```ts
await RecursiveRegister({
  start: "./routes",
  match: (filePath) => {
    return /\.(ts|js)$/.test(filePath)
  },
  onMatch: async ({ absolutePath, relativePath }) => {
    console.log(`Found: ${relativePath}`)
    const module = require(absolutePath)
    // Register the route...
  },
})
```

## Internal Use

This utility powers:

- `registerHttpFileRoutes()` - scans `routesPath` for `{method}.ts` files
- `registerWebsocketsFileEvents()` - scans `wsRoutesPath` for `.ts`/`.js` files
