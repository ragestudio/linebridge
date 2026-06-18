# Response Object

The `res` object is the second parameter in every route handler and middleware. It wraps the raw uWS `HttpResponse` and gives you full control over the outgoing response: status codes, headers, cookies (with optional signing), JSON/HTML bodies, streaming, Server-Sent Events, and redirects.

## Sending Responses

### JSON (most common)

```ts
fn: async (req, res) => {
  return { users: [...] }
  // Equivalent to:
  // res.json({ users: [...] })
}
```

When a handler returns a non-void value and `res.completed` is still `false`, the framework auto-calls `res.json(result)`.

### Manual JSON

```ts
fn: (req, res) => {
  res.status(201).json({ created: true })
}
```

### HTML

```ts
fn: (req, res) => {
  res.html("<h1>Welcome</h1>")
}
```

### Plain text

```ts
fn: (req, res) => {
  res.type("text/plain").send("Hello World")
}
```

### Status-only (no body)

```ts
fn: (req, res) => {
  res.sendStatus(204)  // 204 No Content
}
```

### Redirect

```ts
fn: (req, res) => {
  res.redirect("/login")          // 302 to relative path
  res.redirect("https://...")     // 302 to external URL
}
```

## Status Codes

```ts
res.status(200)              // 200 OK
res.status(201, "Created")   // 201 Created
res.status(404)              // 404 Not Found
res.status(403, "Forbidden") // 403 Forbidden
```

You can also use the `statusCode` getter/setter:

```ts
res.statusCode = 404
```

## Headers

### Setting headers

```ts
res.header("x-custom", "value")
res.header("cache-control", "no-store")

// Multiple values (accumulated)
res.header("set-cookie", "a=1")
res.header("set-cookie", "b=2")

// Overwrite
res.setHeader("content-type", "application/json")
```

### Batch headers

```ts
res.writeHeaders({
  "x-rate-limit": "100",
  "x-rate-remaining": "95",
  "x-cache": "HIT",
})
```

### Content-Type shortcut

```ts
res.type("json")        // application/json
res.type("html")        // text/html
res.type("text/plain")  // text/plain
res.type(".png")        // image/png
```

### Reading / removing headers

```ts
res.getHeader("content-type")    // "application/json"
res.removeHeader("x-powered-by")
```

### Standard header helpers

```ts
res.vary("Accept-Encoding")
res.location("/new-url")

res.links({
  next: "/page/2",
  last: "/page/10",
})
// → Link: </page/2>; rel="next", </page/10>; rel="last"
```

## Cookies

### Setting cookies

Simple cookie with expiry:

```ts
res.cookie("session", token, 3600000)  // 1 hour
```

Delete a cookie:

```ts
res.cookie("session", null)
```

With all options:

```ts
res.cookie("auth", token, 3600000, {
  secure: true,
  sameSite: "none",
  path: "/",
  httpOnly: true,
  domain: ".example.com",
})
```

Default options (when none provided): `{ secure: true, sameSite: "none", path: "/" }`.

### Signed cookies

Set `secret` in options and the value is signed automatically:

```ts
res.cookie("token", userId, 86400000, {
  httpOnly: true,
  secret: "my-signing-secret",
})

// On the next request:
const original = req.unsign(req.cookies.token, "my-signing-secret")
```

### Checking if a cookie is set

```ts
if (res.hasCookie("session")) {
  // already queued
}
```

### Removing / clearing cookies

```ts
res.removeCookie("session")
res.clearCookie("session")  // alias
```

### Shorthand

```ts
res.setCookie("name", "value", { httpOnly: true })
// equivalent to cookie(name, value, null, options)
```

## Streaming Responses

`Response` extends `stream.Writable`. Use chunked responses for large payloads:

### Manual chunking

```ts
fn: (req, res) => {
  res.write("chunk 1\n")
  res.write("chunk 2\n")
  res.write("chunk 3\n")
  res.send()  // finalize
}
```

`write()` returns `false` under backpressure — the server is telling you to slow down.

### Streaming a Readable

```ts
fn: async (req, res) => {
  const fileStream = fs.createReadStream("/path/to/large-file.bin")
  const { size } = fs.statSync("/path/to/large-file.bin")
  await res.stream(fileStream, size)
}
```

If `total_size` is provided, the last chunk uses uWS `tryEnd()` for efficiency.

### Backpressure-aware drain handler

```ts
fn: (req, res) => {
  const chunks = ["chunk1", "chunk2", "chunk3"]
  let i = 0

  res.drain((offset) => {
    if (i >= chunks.length) {
      res.send()
      return true
    }
    return res.write(chunks[i++])
  })

  // kick off with first write
  res.drain(res._drain_handler)
}
```

## Server-Sent Events (SSE)

SSE streams are only available on GET requests. Access via `res.sse` — returns `undefined` on non-GET methods.

```ts
routes = {
  "/events": defineRoute<MyAPI>()({
    method: "get",
    fn: (req, res) => {
      const stream = res.sse
      if (!stream) return  // only available on GET

      stream.open()

      const timer = setInterval(() => {
        if (!stream.active) {
          clearInterval(timer)
          return
        }
        stream.send("message", JSON.stringify({
          time: Date.now(),
        }))
      }, 1000)
    },
  }),
}
```

### SSE Methods

```ts
stream.open()                   // initiate the connection
stream.comment("keep-alive")    // keep-alive (not emitted by EventSource)
stream.send("event", "data")    // named event
stream.send("raw data")         // unnamed event
stream.send("id", "event", "data")  // with id
stream.close()                  // end the stream
```

### Checking connection state

Always check `stream.active` before writing in async loops — it becomes `false` when the client disconnects:

```ts
setInterval(() => {
  if (!stream.active) {
    clearInterval(timer)
    return
  }
  stream.comment("keep-alive")
}, 15000)
```

## Response Events

Listen for lifecycle events on the response:

```ts
middlewares = {
  tracker: async (req, res, next) => {
    res.on("finish", () => {
      console.log(`Response sent: ${req.method} ${req.url}`)
    })

    res.on("abort", (req, res) => {
      console.log("Client disconnected before response")
    })

    res.on("close", (req, res) => {
      console.log("Connection closed")
    })

    next()
  },
}
```

| Event | When |
|-------|------|
| `abort` | Client disconnects before response is sent |
| `finish` | Response body is fully flushed to the client |
| `close` | Response is sent OR connection is aborted |

Event API:

```ts
res.on("finish", handler)        // register
res.once("finish", handler)      // register one-shot
res.off("finish", handler)       // remove
res.listenerCount("finish")      // count listeners
```

## Atomic Writes

Batch multiple writes into a single TCP segment with uWS `cork()`:

```ts
res.atomic(() => {
  res.status(200)
  res.header("x-custom", "value")
  res.header("x-another", "value2")
  res.json({ ok: true })
})
// All headers + body sent in one TCP packet
```

## Checking Response State

```ts
res.completed     // true if response was already sent
res.initiated     // true if headers were written
res.headersSent   // alias for initiated
res.aborted       // alias for completed
res.write_offset  // current uWS write offset (-1 if completed)
```

Useful for guards:

```ts
fn: (req, res) => {
  if (res.completed) return  // already responded

  // ... do work ...
  if (!res.completed) {
    res.json({ result })
  }
}
```

## TypeScript

When using `defineRoute<MyAPI>()`, `res` is typed as the engine-specific Response class:

```ts
defineRoute<MyAPI>()({
  fn: (req, res, ctx) => {
    // res: NeoResponse<MyAPI>

    res.sse              // ✅ typed as SSEventStream | undefined
    res.cookie(...)      // ✅ typed, 5-parameter overload
    res.json(...)        // ✅ typed
    res.write_offset     // ✅ typed as number
    res.atomic(fn)       // ✅ typed

    // res.file(...)     // ❌ does not exist (removed)
    // res.download(...) // ❌ does not exist (removed)
  },
})
```
