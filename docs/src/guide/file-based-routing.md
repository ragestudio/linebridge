# File-Based Routing

Linebridge supports defining routes and WebSocket events through the filesystem. This convention-over-configuration approach eliminates boilerplate and makes your project structure self-documenting.

## HTTP Routes

### Directory Structure

```
routes/
├── users/
│   ├── get.ts          → GET    /users
│   ├── post.ts         → POST   /users
│   └── [id]/
│       ├── get.ts      → GET    /users/:id
│       ├── put.ts      → PUT    /users/:id
│       └── delete.ts   → DELETE /users/:id
├── posts/
│   ├── get.ts          → GET    /posts
│   └── [$].ts          → GET    /posts/*  (catch-all)
└── health/
    └── get.ts          → GET    /health
```

### File Naming Convention

Each route file must follow the pattern `{method}.ts` or `{method}.js`:

| File | HTTP Method | Path |
|------|------------|------|
| `get.ts` | GET | Parent directory path |
| `post.ts` | POST | Parent directory path |
| `put.ts` | PUT | Parent directory path |
| `patch.ts` | PATCH | Parent directory path |
| `delete.ts` | DELETE (`del`) | Parent directory path |
| `options.ts` | OPTIONS | Parent directory path |
| `head.ts` | HEAD | Parent directory path |

### Path Parameters

Directory names wrapped in `[brackets]` become path parameters:

```
routes/users/[id]/get.ts  →  GET /users/:id
routes/posts/[$].ts       →  GET /posts/*   (wildcard)
```

- `[paramName]` → `:paramName`
- `[$]` → `*` (catch-all wildcard, matches any single segment)

If your operating system allows `*` in directory names, you can also use it directly:

```
routes/files/*/get.ts      →  GET /files/*
```

In class-based or dynamic routes, use `*` directly in the path string:

```ts
route.path = "/files/*"          // matches /files/anything
route.path = "/cdn/*/download"   // matches /cdn/123/download
```

### Route File Format

```ts
// routes/users/get.ts
import type MyAPI from "@/index"

export default defineRoute<MyAPI>()({
  useMiddlewares: ["auth"],
  useContexts: ["db"] as const,
  fn: async (req, res, ctx) => {
    const users = await ctx.db.users.find()
    return { users }
  },
})
```

Or simpler, just export a function:

```ts
// routes/health/get.ts
export default async (req, res) => {
  return { status: "ok" }
}
```

## WebSocket Event Files

### Directory Structure

```
ws_routes/
├── chat/
│   ├── message.ts      → event: "chat:message"
│   ├── join.ts         → event: "chat:join"
│   └── leave.ts        → event: "chat:leave"
└── user/
    └── typing.ts       → event: "user:typing"
```

### Event Naming

The file path relative to `ws_routes/` becomes the event name with `/` replaced by `:`:

```
ws_routes/chat/message.ts  →  "chat:message"
ws_routes/user/typing.ts   →  "user:typing"
```

### Event File Format

```ts
// ws_routes/chat/message.ts
export default async (client, data) => {
  const { text, room } = data
  await client.toTopic(`chat:${room}`, "chat:message", {
    user: client.userId,
    text,
  })
}
```

Or with context:

```ts
export default {
  useContexts: ["db"],
  fn: async (client, data, ctx) => {
    await ctx.db.messages.insert({
      user: client.userId,
      text: data.text,
    })
    await client.toTopic("chat", "chat:message", data)
  },
}
```

## Recursive Registration

The `recursiveRegister` utility handles directory scanning:

```ts
await RecursiveRegister({
  start: "./routes",
  match: (filePath) => /(get|post|put|delete|patch|options|head)\.(js|ts)$/i.test(filePath),
  onMatch: async ({ absolutePath, relativePath }) => {
    // absolutePath: /full/path/routes/users/get.ts
    // relativePath: users/get.ts
    // Register the route...
  },
})
```

It recursively walks the directory tree, matching files against a predicate, and calls the handler for each match.
