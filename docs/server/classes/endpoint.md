## Endpoint Class

`Endpoint` is a foundational class for handling HTTP requests within the Linebridge server framework.

### Properties

- `static _constructed`: Boolean flag indicating if an instance has been constructed.
- `static _class`: Boolean flag identifying the object as a class.
- `static useContexts`: Array that can define which contexts should be used.
- `static useMiddlewares`: Array that can define middlewares for the endpoint.
- `context`: Object containing context data passed to the handler.
- `handler`: Instance of HttpRequestHandler that processes the HTTP request.

### Methods

- `constructor(method, context)`: Creates a new Endpoint instance.
  - `method`: Function to execute when the endpoint is triggered.
  - `context`: Context data to be available during execution.
- `run`: The method that will be executed when handling a request. Can be defined in the constructor or in child classes.

### Usage

```js
// Direct usage with function
const getUsers = new Endpoint((req, res) => {
  // Handle request and send response
}, contextObject)

// Extended class usage
class GetUsers extends Endpoint {
  run(req, res) {
    // Handle request and send response
  }
}
```
