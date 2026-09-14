# Services

The gateway manages the lifecycle of Linebridge service processes. Each service is a Node.js process spawned via the Linebridge bootloader.

## Discovery

At startup, the gateway scans the working directory for service directories using `utils.ScanServices()`. A valid service directory contains an `index.ts` (or `index.js`) file.

```
services/api/index.ts     → Service ID: "api"
services/chat/index.ts    → Service ID: "chat"
```

The directory name becomes the service ID, which also serves as:
- The `refName` in the Linebridge Server config (overridden by `LB_SOCKET_MODE=true`)
- The NATS JetStream durable consumer name
- The HTTP routing namespace

## Environment

Each service process receives these environment variables:

| Variable | Value | Purpose |
|----------|-------|---------|
| `LB_SOCKET_MODE` | `true` | Enables Unix socket mode in the service |
| `LB_GATEWAY_SOCKET` | Gateway's IPC path | Service connects to this socket for registration |
| All process env vars | Copied from gateway | Standard env inheritance |
| Infisical secrets | Loaded at startup | Optional secrets injection |

## Process Lifecycle

### Start
```bash
<bootloader> <service-main-file>
```

The bootloader:
1. Loads `.env`
2. Sets up path aliases
3. Registers the Sucrase transpiler
4. Executes the service's `index.ts`

The gateway captures both `stdout` and `stderr` and prefixes each line with a color-coded service ID:

```
[api] Server ready!
[chat] Connected to NATS
```

### Running State

The `Service` struct tracks:
- `Running` — process state flag
- `Cmd` — the `exec.Cmd` instance
- `processDone` — channel signaled on process exit
- `restartRequested` — flag for hot-reload restart
- `skipNextRestart` — flag to suppress auto-restart during shutdown

### Stop

1. Sends `SIGINT` to the process
2. Waits 2 seconds for graceful shutdown
3. If still running, sends `SIGKILL`
4. Waits for the process to exit (3-second timeout)
5. Cleans up state

### Auto-restart

If a service crashes (non-zero exit), the gateway restarts it after a 1-second delay. This covers:
- Unhandled exceptions
- Process kills
- Memory errors

Auto-restart is disabled when:
- `skipNextRestart` is set (during intentional stop)
- The gateway context is cancelled (shutdown)

## Hot Reload (Dev Mode)

When `mode: "dev"`, the gateway attaches an `fsnotify` watcher to each service directory.

### Watcher Behavior

| Event | Action |
|-------|--------|
| File `Write` | Triggers hot-reload (restart service) |
| Directory `Create` | Adds new directory to watcher |
| Directory `Remove` | Removes directory from watcher |

### Ignored Paths

The watcher ignores:
- `node_modules/`
- `.cache/`
- `dist/`
- Hidden files (`.` prefix)
- Temporary files (`~`, `.tmp`, `.swp`, `.swx`)

### Hot Reload Flow

1. File change detected
2. Gateway logs: `Service [api] file modified: routes/users/get.ts, triggering hot-reload`
3. Sends `SIGINT` to the process
4. After 500ms, sends `SIGKILL` if still running
5. Process exits, `restartRequested` flag triggers immediate restart
6. New process spawns with the same environment
7. Service reconnects to the IPC socket and re-registers

## Socket Client

Once a service registers its listen socket via IPC, the gateway creates a persistent Hertz HTTP client for proxying:

```go
func (s *Service) SetListenSocket(socket string) error {
    s.ListenSocket = socket
    newClient, _ := utils.NewUnixSocketClient(socket)
    s.SocketClient = newClient
}
```

The Unix socket client uses Hertz's client with keep-alive for efficient HTTP proxying.

## Monitoring

The gateway monitors process state:
- Process exit code
- Stdout/stderr streams (color-coded and prefixed)
- Watcher events (in dev mode)

The `monitorProcess` goroutine:
1. Calls `cmd.Wait()` (blocks until process exits)
2. Updates service state (`Running = false`)
3. Signals via `processDone` channel
4. Handles auto-restart or requested-restart logic

## CLI Control

Interactive commands while the gateway is running:

```
restart api     → Hot-reload the "api" service
restart chat    → Hot-reload the "chat" service
exit            → Graceful shutdown
```
