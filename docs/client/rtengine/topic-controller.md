# TopicsController
## Overview
`TopicsController` is a utility class for managing topic-based subscriptions in real-time applications. It handles subscribing to topics, listening for specific events, and managing subscription lifecycles.

## API Reference
### Constructor
```javascript
const topicsController = new TopicsController(client)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| client | Object | RTEngine client |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| subscribed | Set | Stores currently subscribed topics |

### Methods

#### on(topic, event, callback)

Registers a callback for a specific event on a given topic.

```javascript
topicsController.on("chat/room1", "message", (data, payload) => {
  console.log("Message received:", data)
})
```

| Parameter | Type | Description |
|-----------|------|-------------|
| topic | string | Topic to associate the event with |
| event | string | Name of the event to listen for |
| callback | Function | Function to execute when the event occurs on the topic |

#### subscribe(topic)

Subscribes to a specific topic.

```javascript
await topicsController.subscribe("chat/room1")
```

| Parameter | Type | Description |
|-----------|------|-------------|
| topic | string | Topic to subscribe to |
| Returns | Promise<boolean> | Resolves to true when subscription is complete |

#### unsubscribe(topic)

Unsubscribes from a specific topic.

```javascript
await topicsController.unsubscribe("chat/room1")
```

| Parameter | Type | Description |
|-----------|------|-------------|
| topic | string | Topic to unsubscribe from |
| Returns | Promise<boolean> | Resolves to true when unsubscription is complete |

#### unsubscribeAll()

Unsubscribes from all currently subscribed topics.

```javascript
await topicsController.unsubscribeAll()
```

| Returns | Promise<boolean> | Resolves to true when all unsubscriptions are complete |

#### regenerate()

Refreshes all current subscriptions by unsubscribing and resubscribing.

```javascript
await topicsController.regenerate()
```

| Returns | Promise<boolean> | Resolves to true when regeneration is complete |

## Basic Usage Example

```javascript
// Initialize
const topicsController = new TopicsController(realTimeClient)

// Subscribe to a topic
await topicsController.subscribe("notifications")

// Listen for events on that topic
topicsController.on("notifications", "new", handleNewNotification)

// Clean up when done
await topicsController.unsubscribe("notifications")
// Or unsubscribe from everything
await topicsController.unsubscribeAll()
```
