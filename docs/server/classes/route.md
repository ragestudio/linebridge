## Route Class

`Route` acts as a container for multiple HTTP method handlers related to the same route path.

### Properties

- `server`: Reference to the server instance.
- `params`: Configuration object containing:
  - `route`: The URL path this route responds to.
  - `useContexts`: Array of context keys to include.
  - `useMiddlewares`: Array of middleware keys to apply.
  - `handlers`: Object containing method handlers.
- `ctx`: Object storing context values that will be shared with Endpoints.

### Methods

- `constructor(server, params = {})`: Creates a new Route instance.
  - [required] `server`: The server instance to register with.
  - `params`: Configuration options for the route.
- `register()`: Registers all HTTP method handlers with the server.

### Usage

```js
class UserRoute extends Route {
  static route = "/users"
  static useContexts = ["database", "auth"]
  static useMiddlewares = ["auth"]

  // Can be a Endpoint class or a Endpoint object
  get = new GetUsers()
  post = new CreateUser()
  // Other methods...
}

// Register with server
const userRoute = new UserRoute(server)
userRoute.register()
```
