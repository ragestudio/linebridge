## File-based Routing
Linebridge has a built-in file-based routing system that will automatically register these routes based on the file structure.
By default, will search on `/routes` directory on cwd.


Create a directory structure that mirrors your route structure:

```
routes/
├── users/
│   ├── get.js       # Handles GET /users
│   ├── post.js      # Handles POST /users
│   └── [id]/        # Dynamic parameter
│       ├── get.js   # Handles GET /users/:id
│       └── delete.js # Handles DELETE /users/:id
```

For example, `/routes/users/get.js` transform to `GET http://localhost:3000/users`


### How to define an endpoint
For file based routes, exists 2 methods to define an endpoint:

### Object endpoint
Define a endpoint by exporting by default a object.

example endpoint (routes/users/get.js) using object:
```javascript
export default {
  // Define contexts needed by this endpoint
  useContexts: ["db"],

  // Define middlewares for this endpoint
  useMiddlewares: ["auth"],

  // Main handler function
  fn: async (req, res, ctx) => {
    const users = await ctx.db.collection("users").find().toArray()

    return { users }
  }
}
```

### Endpoint class
Define a endpoint by exporting by default a class.

[See Endpoint class](../classes/endpoint.md)

example endpoint (routes/users/get.js) using class:
```javascript
export default class extends Endpoint {
  // Define contexts needed by this endpoint
  static useContexts = ["db"]

  // Define middlewares for this endpoint
  static useMiddlewares = ["auth"]

  // Main handler function
  async run(req, res, ctx) {
    const users = await ctx.db.collection("users").find().toArray()

    return { users }
  }
}
```
