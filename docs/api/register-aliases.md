# Register Aliases

Sets up module path aliases using `module-alias` for convenient imports.

## Import

```ts
import registerBaseAliases from "linebridge/utils/registerAliases"
```

## Signature

```ts
function registerBaseAliases(
  fromPath?: string,
  customAliases?: Record<string, string>,
): void
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `fromPath` | `string` | Base path for aliases. Defaults to `process.cwd()/src` or `process.cwd()/dist` |
| `customAliases` | `Record<string, string>` | Additional custom aliases to merge |

## Default Aliases

When called without parameters, registers:

| Alias | Path |
|-------|------|
| `@` | `{fromPath}` |
| `@controllers` | `{fromPath}/controllers` |
| `@middlewares` | `{fromPath}/middlewares` |
| `@models` | `{fromPath}/models` |
| `@classes` | `{fromPath}/classes` |
| `@lib` | `{fromPath}/lib` |
| `@utils` | `{fromPath}/utils` |

Plus any custom aliases provided.

## Usage

```ts
import registerBaseAliases from "linebridge/utils/registerAliases"

// With defaults
registerBaseAliases()

// With custom base path and extra aliases
registerBaseAliases("/app/src", {
  "@config": "/app/config",
  "@services": "/app/src/services",
})
```

Now you can use these aliases in imports:

```ts
import MyServer from "@/index"
import UserModel from "@models/user"
import { auth } from "@middlewares/auth"
```

## Auto-detection

When `fromPath` is not provided, the function checks if the calling module is inside a `dist` directory:

- If in `dist`: resolves to `process.cwd() + "/dist"`
- Otherwise: resolves to `process.cwd() + "/src"`
